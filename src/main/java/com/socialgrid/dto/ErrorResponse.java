package com.socialgrid.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.Map;

// fieldErrors maps a request field to its message so a client can show each error beside its input.
// It is left out of the JSON when null, so errors that aren't about a field look exactly as before.
public record ErrorResponse(int status, String error, String message,
                            @JsonInclude(JsonInclude.Include.NON_NULL) Map<String, String> fieldErrors) {

    public ErrorResponse(int status, String error, String message) {
        this(status, error, message, null);
    }
}
