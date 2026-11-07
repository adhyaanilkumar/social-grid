package com.socialgrid.dto;

import com.socialgrid.validation.MaxUtf8Bytes;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

// Messages are shown to the user beside each field, so they say how to fix the problem.
// The frontend (frontend/src/lib/registerRules.ts) uses the same wording for its own checks.
public record RegisterRequest(
        @NotBlank(message = "Username is required")
        @Size(min = 3, max = 30, message = "Username must be 3–30 characters")
        // Profile URLs contain the username, so characters like / would make a profile unreachable.
        @Pattern(regexp = "^[A-Za-z0-9][A-Za-z0-9._-]*$",
                message = "Username can only use letters, numbers, dots, dashes and underscores") String username,
        @NotBlank(message = "Password is required")
        @Size(min = 8, max = 72, message = "Password must be 8–72 characters")
        // BCrypt rejects more than 72 bytes, and @Size counts characters (e.g. "é" is one character, two bytes).
        // Same message as @Size, so whichever of the two the validator reports first, the user sees the same text.
        @MaxUtf8Bytes(value = 72, message = "Password must be 8–72 characters") String password,
        @NotBlank(message = "Email is required")
        @Email(message = "Enter a valid email address") String email) {
}
