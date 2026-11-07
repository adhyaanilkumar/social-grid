package com.socialgrid.service.impl;

import com.socialgrid.exception.BadRequestException;
import com.socialgrid.service.ImageService.ProcessedImage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.AlphaComposite;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.Random;
import java.util.zip.CRC32;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

// Spec 4.4. Every image is generated here, so the suite carries no binary fixtures.
class ImageServiceImplTest {

    private static final String UNSUPPORTED = "Upload a JPEG or PNG photo";
    private static final String UNREADABLE = "We couldn't read that photo";

    private final ImageServiceImpl service = new ImageServiceImpl();

    // ---- Accepted input and the output's format ----

    @ParameterizedTest
    @ValueSource(strings = {"jpeg", "png"})
    void jpegAndPngAreAcceptedAndOutputIsAlwaysJpeg(String format) throws IOException {
        ProcessedImage out = service.normalizeToJpeg(encode(noise(40, 30), format));

        assertThat(formatOf(out.jpeg())).isEqualToIgnoringCase("jpeg");
        assertThat(out.jpeg()[0]).isEqualTo((byte) 0xFF);
        assertThat(out.jpeg()[1]).isEqualTo((byte) 0xD8);
    }

    @Test
    void greyscalePngIsAccepted() throws IOException {
        BufferedImage grey = new BufferedImage(10, 10, BufferedImage.TYPE_BYTE_GRAY);

        assertThat(formatOf(service.normalizeToJpeg(encode(grey, "png")).jpeg())).isEqualToIgnoringCase("jpeg");
    }

    @Test
    void reportedSizeMatchesTheStoredJpeg() throws IOException {
        ProcessedImage out = service.normalizeToJpeg(encode(plain(2000, 1000), "png"));

        BufferedImage stored = read(out.jpeg());
        assertThat(out.width()).isEqualTo(stored.getWidth());
        assertThat(out.height()).isEqualTo(stored.getHeight());
    }

    // ---- Resizing ----

    @ParameterizedTest(name = "{0}x{1} {4} becomes {2}x{3}")
    @CsvSource({
            "4000, 3000, 1080, 810, jpeg",
            "4000, 3000, 1080, 810, png",
            "1000, 2000, 540, 1080, jpeg",
            "1000, 2000, 540, 1080, png",
            "1081, 1081, 1080, 1080, png",
            "8000, 1, 1080, 1, png"})
    void longestSideIsShrunkTo1080KeepingShape(int width, int height, int expectedWidth, int expectedHeight,
                                               String format) throws IOException {
        ProcessedImage out = service.normalizeToJpeg(encode(plain(width, height), format));

        BufferedImage stored = read(out.jpeg());
        assertThat(stored.getWidth()).isEqualTo(expectedWidth);
        assertThat(stored.getHeight()).isEqualTo(expectedHeight);
    }

    @ParameterizedTest(name = "{0}x{1} stays that size")
    @CsvSource({"1, 1", "100, 50", "50, 100", "1080, 1080", "1080, 200"})
    void smallImagesAreNotEnlarged(int width, int height) throws IOException {
        ProcessedImage out = service.normalizeToJpeg(encode(plain(width, height), "png"));

        BufferedImage stored = read(out.jpeg());
        assertThat(stored.getWidth()).isEqualTo(width);
        assertThat(stored.getHeight()).isEqualTo(height);
    }

    // ---- Transparency ----

    @Test
    void fullyTransparentPngGetsWhiteBackground() throws IOException {
        BufferedImage clear = new BufferedImage(50, 50, BufferedImage.TYPE_INT_ARGB);

        Color centre = new Color(read(service.normalizeToJpeg(encode(clear, "png")).jpeg()).getRGB(25, 25));

        assertThat(centre.getRed()).isGreaterThanOrEqualTo(250);
        assertThat(centre.getGreen()).isGreaterThanOrEqualTo(250);
        assertThat(centre.getBlue()).isGreaterThanOrEqualTo(250);
    }

    @Test
    void halfTransparentPngBlendsWithWhite() throws IOException {
        BufferedImage red = new BufferedImage(50, 50, BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = red.createGraphics();
        graphics.setComposite(AlphaComposite.Src);
        graphics.setColor(new Color(255, 0, 0, 128));
        graphics.fillRect(0, 0, 50, 50);
        graphics.dispose();

        Color centre = new Color(read(service.normalizeToJpeg(encode(red, "png")).jpeg()).getRGB(25, 25));

        assertThat(centre.getRed()).isGreaterThanOrEqualTo(245);
        assertThat(centre.getGreen()).isBetween(110, 145);
        assertThat(centre.getBlue()).isBetween(110, 145);
    }

    @Test
    void opaquePixelsKeepTheirColour() throws IOException {
        BufferedImage blue = new BufferedImage(50, 50, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = blue.createGraphics();
        graphics.setColor(Color.BLUE);
        graphics.fillRect(0, 0, 50, 50);
        graphics.dispose();

        Color centre = new Color(read(service.normalizeToJpeg(encode(blue, "png")).jpeg()).getRGB(25, 25));

        assertThat(centre.getBlue()).isGreaterThanOrEqualTo(240);
        assertThat(centre.getRed()).isLessThanOrEqualTo(15);
        assertThat(centre.getGreen()).isLessThanOrEqualTo(15);
    }

    // ---- Metadata (FR13) ----

    @Test
    void jpegWithExifComesOutWithoutIt() throws IOException {
        byte[] withExif = jpegWithExif(encode(noise(40, 30), "jpeg"), "GPS-48.8584N-2.2945E");
        // Guards the test itself: the input really has the segment and is still a valid JPEG.
        assertThat(segmentMarkers(withExif)).contains(0xE1);
        assertThat(latin1(withExif)).contains("Exif").contains("GPS-48.8584N");
        assertThat(read(withExif)).isNotNull();

        byte[] out = service.normalizeToJpeg(withExif).jpeg();

        assertThat(segmentMarkers(out)).doesNotContain(0xE1);
        assertThat(latin1(out)).doesNotContain("Exif").doesNotContain("GPS-48.8584N");
    }

    @Test
    void pngTextChunkDoesNotReachTheOutput() throws IOException {
        byte[] withText = pngWithTextChunk(encode(noise(40, 30), "png"), "GPS-48.8584N-2.2945E");
        assertThat(latin1(withText)).contains("GPS-48.8584N");

        byte[] out = service.normalizeToJpeg(withText).jpeg();

        assertThat(latin1(out)).doesNotContain("GPS-48.8584N");
    }

    // ---- Dimension limits, checked from the header ----

    // The files below are 4x4 pictures whose headers claim far more. Their pixel data can't fill the claimed size,
    // so a decode attempt would end in the "couldn't read" message (PNG) or return a partial image (JPEG). Getting
    // a different 400 shows the file was turned down from its header alone, before decoding. The spec gives no
    // wording for this rejection, so the text itself isn't pinned.
    @ParameterizedTest(name = "PNG header claiming {0}x{1}")
    @CsvSource({"8001, 1", "1, 8001", "9000, 9000", "7000, 5715", "65535, 65535"})
    void oversizedPngIsRejectedBeforeDecoding(int width, int height) throws IOException {
        byte[] bomb = pngClaiming(encode(noise(4, 4), "png"), width, height);

        BadRequestException e = catchThrowableOfType(BadRequestException.class, () -> service.normalizeToJpeg(bomb));

        assertThat(e).as("rejected with BadRequestException").isNotNull();
        assertThat(e.getMessage()).isNotEqualTo(UNREADABLE).isNotEqualTo(UNSUPPORTED);
    }

    @ParameterizedTest(name = "JPEG header claiming {0}x{1}")
    @CsvSource({"8001, 1", "1, 8001", "9000, 9000", "7000, 5715", "65500, 65500"})
    void oversizedJpegIsRejectedBeforeDecoding(int width, int height) throws IOException {
        byte[] bomb = jpegClaiming(encode(noise(4, 4), "jpeg"), width, height);

        BadRequestException e = catchThrowableOfType(BadRequestException.class, () -> service.normalizeToJpeg(bomb));

        assertThat(e).as("rejected with BadRequestException").isNotNull();
        assertThat(e.getMessage()).isNotEqualTo(UNREADABLE).isNotEqualTo(UNSUPPORTED);
    }

    // Past 65,500 pixels the JPEG library itself refuses the header, so this is a 400 with the "couldn't read" wording.
    @Test
    void jpegBeyondTheLibraryLimitIsStillRejected() throws IOException {
        assertRejected(jpegClaiming(encode(noise(4, 4), "jpeg"), 65535, 65535), UNREADABLE);
    }

    // 8,000 x 5,000 is exactly 40 million pixels, so it's within the limits. This file then fails at decoding,
    // which proves the size check let it through.
    @Test
    void exactlyAtTheLimitsPassesTheSizeCheck() throws IOException {
        byte[] atLimit = pngClaiming(encode(noise(4, 4), "png"), 8000, 5000);

        assertRejected(atLimit, UNREADABLE);
    }

    // ---- Rejected files: always BadRequestException, never another type ----

    @Test
    void gifIsRejected() throws IOException {
        assertRejected(encode(noise(10, 10), "gif"), UNSUPPORTED);
    }

    @Test
    void bmpIsRejected() throws IOException {
        assertRejected(encode(noise(10, 10), "bmp"), UNSUPPORTED);
    }

    @Test
    void svgIsRejected() {
        assertRejected(utf8("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>"), UNSUPPORTED);
    }

    @Test
    void plainTextIsRejected() {
        assertRejected(utf8("this is not a photo"), UNSUPPORTED);
    }

    @Test
    void emptyFileIsRejected() {
        assertRejected(new byte[0], UNSUPPORTED);
    }

    @Test
    void truncatedPngIsRejected() throws IOException {
        byte[] png = encode(noise(200, 200), "png");

        assertRejected(Arrays.copyOf(png, png.length / 2), UNREADABLE);
    }

    @Test
    void pngCutInsideItsHeaderIsRejected() throws IOException {
        assertRejected(Arrays.copyOf(encode(noise(200, 200), "png"), 20), UNREADABLE);
    }

    @Test
    void truncatedJpegIsRejected() throws IOException {
        byte[] jpeg = encode(noise(200, 200), "jpeg");

        assertRejected(Arrays.copyOf(jpeg, jpeg.length / 2), UNREADABLE);
    }

    @Test
    void jpegCutInsideItsHeaderIsRejected() throws IOException {
        assertRejected(Arrays.copyOf(encode(noise(200, 200), "jpeg"), 20), UNREADABLE);
    }

    @Test
    void pngSignatureFollowedByRubbishIsRejected() {
        byte[] rubbish = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 'r', 'u', 'b', 'b', 'i', 's', 'h'};

        assertRejected(rubbish, UNREADABLE);
    }

    @Test
    void jpegSignatureFollowedByRubbishIsRejected() {
        byte[] rubbish = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 'r', 'u', 'b', 'b', 'i', 's', 'h'};

        assertRejected(rubbish, UNREADABLE);
    }

    @Test
    void pngClaimingZeroWidthIsRejected() throws IOException {
        assertRejected(pngClaiming(encode(noise(4, 4), "png"), 0, 4), UNREADABLE);
    }

    // ---- Helpers ----

    private void assertRejected(byte[] upload, String message) {
        assertThatThrownBy(() -> service.normalizeToJpeg(upload))
                .isExactlyInstanceOf(BadRequestException.class)
                .hasMessage(message);
    }

    private static byte[] utf8(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }

    private static String latin1(byte[] bytes) {
        return new String(bytes, StandardCharsets.ISO_8859_1);
    }

    private static byte[] latin1Bytes(String text) {
        return text.getBytes(StandardCharsets.ISO_8859_1);
    }

    private static BufferedImage plain(int width, int height) {
        return new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
    }

    // Random pixels barely compress, so these files have plenty of pixel data to cut through.
    private static BufferedImage noise(int width, int height) {
        BufferedImage image = plain(width, height);
        Random random = new Random(42);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                image.setRGB(x, y, random.nextInt(0xFFFFFF));
            }
        }
        return image;
    }

    private static byte[] encode(BufferedImage image, String format) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        assertThat(ImageIO.write(image, format, bytes)).as("a writer exists for " + format).isTrue();
        return bytes.toByteArray();
    }

    private static BufferedImage read(byte[] bytes) throws IOException {
        return ImageIO.read(new ByteArrayInputStream(bytes));
    }

    private static String formatOf(byte[] bytes) throws IOException {
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            assertThat(readers.hasNext()).as("output is a recognised image").isTrue();
            return readers.next().getFormatName();
        }
    }

    // A JPEG is a list of segments, each "FF, marker, 2-byte length including itself, data", up to the pixel
    // data at marker DA. E1 is APP1, the segment EXIF lives in.
    private static List<Integer> segmentMarkers(byte[] jpeg) {
        List<Integer> markers = new ArrayList<>();
        int position = 2;
        while ((jpeg[position] & 0xFF) == 0xFF) {
            int marker = jpeg[position + 1] & 0xFF;
            if (marker == 0xDA) {
                break;
            }
            markers.add(marker);
            position += 2 + ((jpeg[position + 2] & 0xFF) << 8 | (jpeg[position + 3] & 0xFF));
        }
        return markers;
    }

    // Inserts a hand-built APP1 Exif segment straight after the start-of-image marker.
    private static byte[] jpegWithExif(byte[] jpeg, String secret) {
        byte[] payload = latin1Bytes("Exif\0\0II*\0\b\0\0\0" + secret);
        ByteBuffer out = ByteBuffer.allocate(jpeg.length + 4 + payload.length);
        out.put(jpeg, 0, 2);
        out.put((byte) 0xFF).put((byte) 0xE1).putShort((short) (payload.length + 2)).put(payload);
        out.put(jpeg, 2, jpeg.length - 2);
        return out.array();
    }

    // Overwrites the frame header's height and width. Layout: FF C0, length (2), precision (1), height (2), width (2).
    private static byte[] jpegClaiming(byte[] jpeg, int width, int height) {
        byte[] patched = jpeg.clone();
        ByteBuffer buffer = ByteBuffer.wrap(patched);
        int position = 2;
        while ((patched[position + 1] & 0xFF) != 0xC0) {
            position += 2 + (buffer.getShort(position + 2) & 0xFFFF);
        }
        buffer.putShort(position + 5, (short) height);
        buffer.putShort(position + 7, (short) width);
        return patched;
    }

    // A PNG starts with an 8-byte signature, then IHDR: length (4), "IHDR" (4), width (4), height (4), 5 more bytes,
    // CRC (4). The CRC covers the type and data, so it's recalculated to keep the header valid.
    private static byte[] pngClaiming(byte[] png, int width, int height) {
        byte[] patched = png.clone();
        ByteBuffer buffer = ByteBuffer.wrap(patched);
        buffer.putInt(16, width);
        buffer.putInt(20, height);
        CRC32 crc = new CRC32();
        crc.update(patched, 12, 17);
        buffer.putInt(29, (int) crc.getValue());
        return patched;
    }

    // Inserts a tEXt chunk straight after IHDR, which ends at byte 33.
    private static byte[] pngWithTextChunk(byte[] png, String secret) {
        byte[] typeAndData = latin1Bytes("tEXtComment\0" + secret);
        CRC32 crc = new CRC32();
        crc.update(typeAndData);
        ByteBuffer out = ByteBuffer.allocate(png.length + 8 + typeAndData.length);
        out.put(png, 0, 33);
        out.putInt(typeAndData.length - 4).put(typeAndData).putInt((int) crc.getValue());
        out.put(png, 33, png.length - 33);
        return out.array();
    }
}
