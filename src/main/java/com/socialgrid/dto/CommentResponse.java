package com.socialgrid.dto;

public record CommentResponse(Integer commentId, Integer authorId, String authorUsername, Integer postId,
                              String message) {
}
