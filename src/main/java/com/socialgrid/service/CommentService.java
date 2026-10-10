package com.socialgrid.service;

import com.socialgrid.dto.CommentRequest;
import com.socialgrid.dto.CommentResponse;

import java.util.List;

public interface CommentService {

    CommentResponse createComment(Integer authorId, Integer postId, CommentRequest request);

    CommentResponse updateMessage(Integer userId, Integer commentId, CommentRequest request);

    void deleteComment(Integer userId, Integer commentId);

    List<CommentResponse> getCommentsForPost(Integer postId);
}
