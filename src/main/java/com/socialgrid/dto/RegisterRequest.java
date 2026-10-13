package com.socialgrid.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// Messages are shown to the user beside each field, so they say how to fix the problem.
// The frontend (frontend/src/lib/registerRules.ts) uses the same wording for its own checks.
public record RegisterRequest(
        @NotBlank(message = "Username is required")
        @Size(min = 3, max = 30, message = "Username must be 3–30 characters") String username,
        @NotBlank(message = "Password is required")
        @Size(min = 8, max = 72, message = "Password must be 8–72 characters") String password,
        @NotBlank(message = "Email is required")
        @Email(message = "Enter a valid email address") String email) {
}
