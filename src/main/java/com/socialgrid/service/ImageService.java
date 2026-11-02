package com.socialgrid.service;

public interface ImageService {

    // A JPEG the server made itself, with its final size in pixels.
    record ProcessedImage(byte[] jpeg, int width, int height) {
    }

    // Checks an untrusted upload and redraws it as a clean JPEG. Throws BadRequestException if it isn't acceptable.
    ProcessedImage normalizeToJpeg(byte[] upload);
}
