package com.socialgrid.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PostCreateRequest(
        @NotBlank @Size(max = 255) String mediaUrl,
        @Size(max = 2200) String caption) {
}
