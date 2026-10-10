package com.socialgrid.dto;

public record ErrorResponse(int status, String error, String message) {
}
