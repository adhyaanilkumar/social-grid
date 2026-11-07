package com.socialgrid.service.impl;

import com.socialgrid.exception.BadRequestException;
import com.socialgrid.service.ImageService;
import org.springframework.stereotype.Service;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

// Uploaded files are untrusted, so the server never stores or serves what it receives. It reads the pixels and
// draws them onto a new image. Only pixels are copied, so metadata such as a phone photo's GPS location is left behind.
@Service
public class ImageServiceImpl implements ImageService {

    private static final Set<String> ALLOWED_FORMATS = Set.of("jpeg", "png");
    private static final int MAX_INPUT_SIDE = 8_000;
    private static final long MAX_INPUT_PIXELS = 40_000_000L;
    private static final int MAX_OUTPUT_SIDE = 1_080;
    private static final float JPEG_QUALITY = 0.85f;

    private static final String UNSUPPORTED = "Upload a JPEG or PNG photo";
    private static final String UNREADABLE = "We couldn't read that photo";
    private static final String TOO_MANY_PIXELS = "That photo's dimensions are too large";

    @Override
    public ProcessedImage normalizeToJpeg(byte[] upload) {
        return encode(redraw(decode(upload)));
    }

    private BufferedImage decode(byte[] upload) {
        // The memory-backed stream keeps untrusted bytes out of temporary files on disk.
        try (ImageInputStream input = new MemoryCacheImageInputStream(new ByteArrayInputStream(upload))) {
            // ImageIO identifies the format from the file's contents. The file name and declared type can be faked.
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                throw new BadRequestException(UNSUPPORTED);
            }
            ImageReader reader = readers.next();
            try {
                // Rejects GIF and anything else ImageIO knows. SVG has no reader, so it fails the check above.
                if (!ALLOWED_FORMATS.contains(reader.getFormatName().toLowerCase(Locale.ROOT))) {
                    throw new BadRequestException(UNSUPPORTED);
                }
                // ignoreMetadata = true: we never want it, and it's more attacker-controlled data to parse.
                reader.setInput(input, true, true);
                // The size comes from the header, before any pixels are decoded. A tiny file can decode into
                // gigabytes of memory (a "decompression bomb"), so this has to happen first.
                long width = reader.getWidth(0);
                long height = reader.getHeight(0);
                if (width > MAX_INPUT_SIDE || height > MAX_INPUT_SIDE || width * height > MAX_INPUT_PIXELS) {
                    throw new BadRequestException(TOO_MANY_PIXELS);
                }
                // A truncated or corrupt JPEG doesn't throw: the reader reports a warning ("Premature end of JPEG
                // file") and returns a partly grey image. The listener records any warning so we reject the file.
                // It only records: the JPEG reader calls it from native code, so throwing there is unsafe.
                AtomicBoolean warned = new AtomicBoolean(false);
                reader.addIIOReadWarningListener((source, warning) -> warned.set(true));
                BufferedImage image = reader.read(0);
                if (warned.get()) {
                    throw new BadRequestException(UNREADABLE);
                }
                return image;
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            // Keep our own messages. Anything else means the file is damaged: that's a 400, not a server error.
            if (e instanceof BadRequestException badRequest) {
                throw badRequest;
            }
            throw new BadRequestException(UNREADABLE);
        }
    }

    private BufferedImage redraw(BufferedImage source) {
        double scale = Math.min(1.0, (double) MAX_OUTPUT_SIDE / Math.max(source.getWidth(), source.getHeight()));
        int width = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(source.getHeight() * scale));

        // TYPE_INT_RGB has no transparency, which JPEG can't store. The white fill is what shows through
        // a transparent PNG.
        BufferedImage target = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = target.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, width, height);
            graphics.drawImage(source, 0, 0, width, height, null);
        } finally {
            graphics.dispose();
        }
        return target;
    }

    private ProcessedImage encode(BufferedImage image) {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ImageOutputStream output = new MemoryCacheImageOutputStream(bytes)) {
            ImageWriteParam params = writer.getDefaultWriteParam();
            params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            params.setCompressionQuality(JPEG_QUALITY);
            writer.setOutput(output);
            writer.write(null, new IIOImage(image, null, null), params);
        } catch (IOException e) {
            // Writing to memory shouldn't fail, and this is our own image, so it would be a server fault, not the user's.
            throw new IllegalStateException("Couldn't encode JPEG", e);
        } finally {
            writer.dispose();
        }
        return new ProcessedImage(bytes.toByteArray(), image.getWidth(), image.getHeight());
    }
}
