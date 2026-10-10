package com.socialgrid.repository;

import com.socialgrid.entity.Like;
import com.socialgrid.entity.LikeId;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LikeRepository extends JpaRepository<Like, LikeId> {

    long countByLikeIdPostId(Integer postId);
}
