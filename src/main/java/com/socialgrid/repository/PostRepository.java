package com.socialgrid.repository;

import com.socialgrid.dto.PostView;
import com.socialgrid.entity.Post;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

// The feed queries fetch each post's author, counts and "did I like this" in one statement. Looping over posts
// and asking for each detail separately would run about 60 queries for a page of 20 (the "N+1" problem).
// "Newest first" sorts by post_id: IDs only ever increase, and being unique they make paging simple.
public interface PostRepository extends JpaRepository<Post, Integer> {

    @Query("""
            SELECT new com.socialgrid.dto.PostView(p.postId, p.authorId, u.username, p.mediaUrl, p.caption,
                p.width, p.height,
                (SELECT COUNT(l) FROM Like l WHERE l.likeId.postId = p.postId),
                (SELECT COUNT(c) FROM Comment c WHERE c.postId = p.postId),
                CASE WHEN EXISTS (SELECT 1 FROM Like m WHERE m.likeId.postId = p.postId AND m.likeId.userId = :me)
                     THEN true ELSE false END)
            FROM Post p JOIN User u ON u.id = p.authorId
            WHERE p.postId < :before
              AND (p.authorId = :me
                   OR p.authorId IN (SELECT f.id.followeeId FROM Follows f WHERE f.id.followerId = :me))
            ORDER BY p.postId DESC
            """)
    List<PostView> findHomeFeed(@Param("me") Integer me, @Param("before") Integer before, Pageable page);

    @Query("""
            SELECT new com.socialgrid.dto.PostView(p.postId, p.authorId, u.username, p.mediaUrl, p.caption,
                p.width, p.height,
                (SELECT COUNT(l) FROM Like l WHERE l.likeId.postId = p.postId),
                (SELECT COUNT(c) FROM Comment c WHERE c.postId = p.postId),
                CASE WHEN EXISTS (SELECT 1 FROM Like m WHERE m.likeId.postId = p.postId AND m.likeId.userId = :me)
                     THEN true ELSE false END)
            FROM Post p JOIN User u ON u.id = p.authorId
            WHERE p.postId < :before
            ORDER BY p.postId DESC
            """)
    List<PostView> findExploreFeed(@Param("me") Integer me, @Param("before") Integer before, Pageable page);

    // NFR3: the user lookup rides in the same statement. Starting from User with a LEFT JOIN gives:
    //   - no rows at all: no such username (the service turns that into 404);
    //   - one row with a null postId: the user exists but has no posts on this page (an empty page, not 404);
    //   - otherwise: the user's posts, exactly as Home and Explore show them.
    // The paging condition sits in ON, not WHERE, so it can't filter away the user's row.

    @Query("""
            SELECT new com.socialgrid.dto.PostView(p.postId, p.authorId, u.username, p.mediaUrl, p.caption,
                p.width, p.height,
                (SELECT COUNT(l) FROM Like l WHERE l.likeId.postId = p.postId),
                (SELECT COUNT(c) FROM Comment c WHERE c.postId = p.postId),
                CASE WHEN EXISTS (SELECT 1 FROM Like m WHERE m.likeId.postId = p.postId AND m.likeId.userId = :me)
                     THEN true ELSE false END)
            FROM User u LEFT JOIN Post p ON p.authorId = u.id AND p.postId < :before
            WHERE u.username = :username
            ORDER BY p.postId DESC
            """)
    List<PostView> findUserPostsByUsername(@Param("me") Integer me, @Param("username") String username,
                                           @Param("before") Integer before, Pageable page);

    long countByAuthorId(Integer authorId);
}
