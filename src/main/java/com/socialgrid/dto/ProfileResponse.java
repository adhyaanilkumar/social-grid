package com.socialgrid.dto;

public record ProfileResponse(
        Integer userId,
        String username,
        String firstName,
        String lastName,
        String bio,
        String profilePicUrl) {
}
