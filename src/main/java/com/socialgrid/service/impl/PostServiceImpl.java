package com.socialgrid.service.impl;

import com.socialgrid.dto.PostCreateRequest;
import com.socialgrid.dto.PostResponse;
import com.socialgrid.dto.PostUpdateRequest;
import com.socialgrid.entity.Post;
import com.socialgrid.exception.ForbiddenException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.repository.LikeRepository;
import com.socialgrid.repository.PostRepository;
import com.socialgrid.service.PostService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PostServiceImpl implements PostService {

    private final PostRepository postRepository;
    private final LikeRepository likeRepository;

    public PostServiceImpl(PostRepository postRepository, LikeRepository likeRepository) {
        this.postRepository = postRepository;
        this.likeRepository = likeRepository;
    }

    @Override
    @Transactional
    public PostResponse createPost(Integer authorId, PostCreateRequest request) {
        Post post = postRepository.save(new Post(authorId, request.mediaUrl(), request.caption()));
        return toResponse(post);
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
