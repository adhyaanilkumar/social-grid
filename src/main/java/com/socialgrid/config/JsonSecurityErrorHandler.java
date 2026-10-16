package com.socialgrid.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.socialgrid.dto.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;

import java.io.IOException;

// Security rejects requests in a filter, before any controller runs, so GlobalExceptionHandler never sees them.
// This writes those rejections in the same {status, error, message} shape as every other error.
// Created in SecurityConfig rather than as a @Component so @WebMvcTest slices get it with the config.
public class JsonSecurityErrorHandler implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final ObjectMapper objectMapper;

    public JsonSecurityErrorHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    // Not logged in (no session, or it expired).
    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException e) throws IOException {
        write(response, HttpStatus.UNAUTHORIZED, "Log in to continue");
    }

    // Logged in or not, the request was refused — in practice a missing or wrong CSRF token.
    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
                       AccessDeniedException e) throws IOException {
        write(response, HttpStatus.FORBIDDEN, "Request was refused. Refresh the page and try again.");
    }

    private void write(HttpServletResponse response, HttpStatus status, String message) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(),
                new ErrorResponse(status.value(), status.getReasonPhrase(), message));
    }
}
