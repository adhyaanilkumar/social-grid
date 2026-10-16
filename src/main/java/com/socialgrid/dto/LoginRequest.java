package com.socialgrid.dto;

import jakarta.validation.constraints.NotBlank;

// identifier is either a username or an email address; SecurityUserDetailsService tries both.
public record LoginRequest(
        @NotBlank(message = "Username or email is required") String identifier,
        @NotBlank(message = "Password is required") String password) {
}
