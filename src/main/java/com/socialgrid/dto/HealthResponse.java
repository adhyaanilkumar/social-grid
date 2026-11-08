package com.socialgrid.dto;

// "UP" or "DOWN", and nothing else: the endpoint is public.
public record HealthResponse(String status) {
}
