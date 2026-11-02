package com.socialgrid.service.impl;

import com.socialgrid.dto.PostResponse;
import com.socialgrid.dto.PostUpdateRequest;
import com.socialgrid.entity.Post;
import com.socialgrid.entity.PostImage;
import com.socialgrid.exception.BadRequestException;
import com.socialgrid.exception.ForbiddenException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.repository.LikeRepository;
import com.socialgrid.repository.PostImageRepository;
import com.socialgrid.repository.PostRepository;
import com.socialgrid.service.ImageService;
import com.socialgrid.service.PostService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PostServiceImpl implements PostService {

    private static final int MAX_CAPTION_LENGTH = 2200;

    private final PostRepository postRepository;
    private final PostImageRepository postImageRepository;
    private final LikeRepository likeRepository;

    public PostServiceImpl(PostRepository postRepository, PostImageRepository postImageRepository,
                           LikeRepository likeRepository) {
        this.postRepository = postRepository;
        this.postImageRepository = postImageRepository;
        this.likeRepository = likeRepository;
    }

    // One transaction: either the post and its photo are both saved, or neither is.
    @Override
    @Transactional
    public PostResponse createPost(Integer authorId, ImageService.ProcessedImage image, String caption) {
        if (caption != null && caption.length() > MAX_CAPTION_LENGTH) {
            throw new BadRequestException("Captions can be up to 2,200 characters");
        }
        String savedCaption = caption == null || caption.isBlank() ? null : caption;
        Post post = postRepository.save(new Post(authorId, savedCaption, image.width(), image.height()));
        postImageRepository.save(new PostImage(post.getPostId(), image.jpeg()));
        // The URL contains the post's ID, which only exists after the save. Hibernate writes this change
        // to the database when the transaction ends.
        post.setMediaURL("/api/posts/" + post.getPostId() + "/image");
        return toResponse(post);
    }

    @Override
    @Transactional(readOnly = true)
    public byte[] getImage(Integer postId) {
        return postImageRepository.findById(postId)
                .map(PostImage::getData)
                .orElseThrow(() -> new NotFoundException("Photo not found"));
    }

    @Override
    @Transactional
    public PostResponse updatePost(Integer userId, Integer postId, PostUpdateRequest request) {
        Post post = findOwnedPost(userId, postId);
        if (request.mediaUrl() != null) post.setMediaURL(request.mediaUrl());
        if (request.caption() != null) post.setCaption(request.caption());
        return toResponse(post);
    }

    // The post's comments and likes are removed by the database (ON DELETE CASCADE in schema.sql).
    @Override
    @Transactional
    public void deletePost(Integer userId, Integer postId) {
        postRepository.delete(findOwnedPost(userId, postId));
    }

    @Override
    @Transactional(readOnly = true)
    public PostResponse getPost(Integer postId) {
        return postRepository.findById(postId)
                .map(this::toResponse)
                .orElseThrow(() -> new NotFoundException("Post not found"));
    }

    private Post findOwnedPost(Integer userId, Integer postId) {
        Post post = postRepository.findById(postId)
                .orElseThrow(() -> new NotFoundException("Post not found"));
        if (!post.getAuthorId().equals(userId)) {
            throw new ForbiddenException("Only the author can modify this post");
        }
        return post;
    }

    private PostResponse toResponse(Post post) {
        return new PostResponse(post.getPostId(), post.getAuthorId(), post.getMediaURL(), post.getCaption(),
                likeRepository.countByLikeIdPostId(post.getPostId()));
    }
}
