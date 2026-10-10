package com.socialgrid.service.impl;

import com.socialgrid.dto.CommentRequest;
import com.socialgrid.dto.CommentResponse;
import com.socialgrid.entity.Comment;
import com.socialgrid.exception.ForbiddenException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.repository.CommentRepository;
import com.socialgrid.repository.PostRepository;
import com.socialgrid.service.CommentService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class CommentServiceImpl implements CommentService {

    private final CommentRepository commentRepository;
    private final PostRepository postRepository;

    public CommentServiceImpl(CommentRepository commentRepository, PostRepository postRepository) {
        this.commentRepository = commentRepository;
        this.postRepository = postRepository;
    }

    @Override
    @Transactional
    public CommentResponse createComment(Integer authorId, Integer postId, CommentRequest request) {
        requirePost(postId);
        return toResponse(commentRepository.save(new Comment(authorId, postId, request.message())));
    }

    @Override
    @Transactional
    public CommentResponse updateMessage(Integer userId, Integer commentId, CommentRequest request) {
        Comment comment = findOwnedComment(userId, commentId);
        comment.setMessage(request.message());
        return toResponse(comment);
    }

    @Override
    @Transactional
    public void deleteComment(Integer userId, Integer commentId) {
        commentRepository.delete(findOwnedComment(userId, commentId));
    }

    @Override
    @Transactional(readOnly = true)
    public List<CommentResponse> getCommentsForPost(Integer postId) {
        requirePost(postId);
        return commentRepository.findByPostIdOrderByCommentIdAsc(postId).stream()
                .map(this::toResponse)
                .toList();
    }

    private void requirePost(Integer postId) {
        if (!postRepository.existsById(postId)) {
            throw new NotFoundException("Post not found");
        }
    }

    private Comment findOwnedComment(Integer userId, Integer commentId) {
        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new NotFoundException("Comment not found"));
        if (!comment.getAuthorId().equals(userId)) {
            throw new ForbiddenException("Only the author can modify this comment");
        }
        return comment;
    }

    private CommentResponse toResponse(Comment comment) {
        return new CommentResponse(comment.getCommentId(), comment.getAuthorId(), comment.getPostId(),
                comment.getMessage());
    }
}
