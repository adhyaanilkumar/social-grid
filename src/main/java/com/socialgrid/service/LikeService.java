package com.socialgrid.service;

import com.socialgrid.entity.Like;

public interface LikeService {

    Like createLike(Integer userId, Integer postId);

    void deleteLike(Integer userId, Integer postId);
}
