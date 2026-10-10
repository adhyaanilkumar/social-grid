package com.socialgrid.repository;

import com.socialgrid.entity.Comment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CommentRepository extends JpaRepository<Comment, Integer> {

    List<Comment> findByPostIdOrderByCommentIdAsc(Integer postId);
}
