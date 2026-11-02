package com.socialgrid.repository;

import com.socialgrid.dto.CommentResponse;
import com.socialgrid.entity.Comment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CommentRepository extends JpaRepository<Comment, Integer> {

    // Joins the author in, so reading a post's comments takes one query rather than one per comment.
    @Query("""
            SELECT new com.socialgrid.dto.CommentResponse(c.commentId, c.authorId, u.username, c.postId, c.message)
            FROM Comment c JOIN User u ON u.id = c.authorId
            WHERE c.postId = :postId
            ORDER BY c.commentId ASC
            """)
    List<CommentResponse> findResponsesByPostId(@Param("postId") Integer postId);
}
