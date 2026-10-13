package com.socialgrid.exception;

public class ConflictException extends RuntimeException {

    // The request field that clashed (e.g. "username"), or null when the conflict isn't about one field.
    private final String field;

    public ConflictException(String message) {
        this(null, message);
    }

    public ConflictException(String field, String message) {
        super(message);
        this.field = field;
    }

    public String getField() {
        return field;
    }
}
