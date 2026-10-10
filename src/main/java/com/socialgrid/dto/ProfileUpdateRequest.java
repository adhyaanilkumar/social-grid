package com.socialgrid.dto;

import jakarta.validation.constraints.Size;

// Every field is optional: null means "leave unchanged".
public record ProfileUpdateRequest(
        @Size(max = 50) String firstName,
        @Size(max = 50) String lastName,
        @Size(max = 500) String bio,
        @Size(max = 255) String profilePicUrl) {
}
