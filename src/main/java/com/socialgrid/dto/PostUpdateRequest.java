package com.socialgrid.dto;

import jakarta.validation.constraints.Size;

// Every field is optional: null means "leave unchanged".
public record PostUpdateRequest(
        @Size(min = 1, max = 255) String mediaUrl,
        @Size(max = 2200) String caption) {
}
