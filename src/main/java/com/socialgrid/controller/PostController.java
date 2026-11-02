package com.socialgrid.controller;

import com.socialgrid.config.SecurityUser;
import com.socialgrid.dto.CommentRequest;
import com.socialgrid.dto.CommentResponse;
import com.socialgrid.dto.LikeResponse;
import com.socialgrid.dto.PostResponse;
import com.socialgrid.dto.PostUpdateRequest;
import com.socialgrid.entity.Like;
import com.socialgrid.service.CommentService;
import com.socialgrid.service.ImageService;
import com.socialgrid.service.LikeService;
import com.socialgrid.service.PostService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Duration;
import java.util.List;

@RestController
@RequestMapping("/api/posts")
public class PostController {

    private final PostService postService;
    private final CommentService commentService;
    private final LikeService likeService;
    private final ImageService imageService;

    public PostController(PostService postService, CommentService commentService, LikeService likeService,
                          ImageService imageService) {
        this.postService = postService;
        this.commentService = commentService;
        this.likeService = likeService;
        this.imageService = imageService;
    }

    // multipart/form-data is the browser's format for sending files.
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public PostResponse createPost(@AuthenticationPrincipal SecurityUser me,
                                   @RequestPart("image") MultipartFile image,
                                   @RequestParam(required = false) String caption) throws IOException {
        // Processed before the database transaction starts, so a slow image doesn't hold a database connection.
        ImageService.ProcessedImage processed = imageService.normalizeToJpeg(image.getBytes());
        return postService.createPost(me.getId(), processed, caption);
    }

    @GetMapping("/{postId}/image")
    public ResponseEntity<byte[]> getImage(@PathVariable Integer postId) {
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                // private: only this user's browser may cache it. A cached photo skips the login check,
                // so the window stays short.
                .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePrivate())
                .body(postService.getImage(postId));
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
