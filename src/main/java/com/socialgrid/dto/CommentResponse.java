package com.socialgrid.dto;

public record CommentResponse(Integer commentId, Integer authorId, Integer postId, String message) {
}
