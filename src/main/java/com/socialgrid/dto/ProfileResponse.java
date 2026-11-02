package com.socialgrid.dto;

public record ProfileResponse(
        Integer userId,
        String username,
        String firstName,
        String lastName,
        String bio,
        String profilePicUrl,
        long postCount,
        long followerCount,
        long followingCount,
        boolean followedByMe) {
}
