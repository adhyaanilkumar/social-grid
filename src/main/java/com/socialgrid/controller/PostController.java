package com.socialgrid.controller;

import com.socialgrid.config.SecurityUser;
import com.socialgrid.dto.CommentRequest;
import com.socialgrid.dto.CommentResponse;
import com.socialgrid.dto.LikeResponse;
import com.socialgrid.dto.PostCreateRequest;
import com.socialgrid.dto.PostResponse;
import com.socialgrid.dto.PostUpdateRequest;
import com.socialgrid.entity.Like;
import com.socialgrid.service.CommentService;
import com.socialgrid.service.LikeService;
import com.socialgrid.service.PostService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/posts")
public class PostController {

    private final PostService postService;
    private final CommentService commentService;
    private final LikeService likeService;

    public PostController(PostService postService, CommentService commentService, LikeService likeService) {
        this.postService = postService;
        this.commentService = commentService;
        this.likeService = likeService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PostResponse createPost(@AuthenticationPrincipal SecurityUser me,
                                   @Valid @RequestBody PostCreateRequest request) {
        return postService.createPost(me.getId(), request);
    }

    @GetMapping("/{postId}")
    public PostResponse getPost(@PathVariable Integer postId) {
        return postService.getPost(postId);
    }

    @PutMapping("/{postId}")
    public PostResponse updatePost(@AuthenticationPrincipal SecurityUser me, @PathVariable Integer postId,
                                   @Valid @RequestBody PostUpdateRequest request) {
        return postService.updatePost(me.getId(), postId, request);
    }

    @DeleteMapping("/{postId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePost(@AuthenticationPrincipal SecurityUser me, @PathVariable Integer postId) {
        postService.deletePost(me.getId(), postId);
    }

    @PostMapping("/{postId}/comments")
    @ResponseStatus(HttpStatus.CREATED)
    public CommentResponse createComment(@AuthenticationPrincipal SecurityUser me, @PathVariable Integer postId,
                                         @Valid @RequestBody CommentRequest request) {
        return commentService.createComment(me.getId(), postId, request);
    }

    @GetMapping("/{postId}/comments")
    public List<CommentResponse> getComments(@PathVariable Integer postId) {
        return commentService.getCommentsForPost(postId);
    }

    @PostMapping("/{postId}/likes")
    @ResponseStatus(HttpStatus.CREATED)
    public LikeResponse like(@AuthenticationPrincipal SecurityUser me, @PathVariable Integer postId) {
        Like like = likeService.createLike(me.getId(), postId);
        return new LikeResponse(like.getLikeId().getPostId(), like.getLikeId().getUserId());
    }

    @DeleteMapping("/{postId}/likes")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unlike(@AuthenticationPrincipal SecurityUser me, @PathVariable Integer postId) {
        likeService.deleteLike(me.getId(), postId);
    }
}
