package com.socialgrid.dto;

public record PostResponse(Integer postId, Integer authorId, String mediaUrl, String caption, long likeCount) {
}
