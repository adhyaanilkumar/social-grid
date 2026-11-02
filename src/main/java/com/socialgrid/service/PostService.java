package com.socialgrid.service;

import com.socialgrid.dto.PostResponse;
import com.socialgrid.dto.PostUpdateRequest;

public interface PostService {

    PostResponse createPost(Integer authorId, ImageService.ProcessedImage image, String caption);

    PostResponse updatePost(Integer userId, Integer postId, PostUpdateRequest request);

    void deletePost(Integer userId, Integer postId);

    PostResponse getPost(Integer postId);

    byte[] getImage(Integer postId);
}
