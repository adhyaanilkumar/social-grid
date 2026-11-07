package com.socialgrid.integration;

import com.socialgrid.TestDatabaseConfig;
import com.socialgrid.dto.CommentRequest;
import com.socialgrid.entity.User;
import com.socialgrid.repository.UserRepository;
import com.socialgrid.service.CommentService;
import com.socialgrid.service.FollowService;
import com.socialgrid.service.ImageService;
import com.socialgrid.service.LikeService;
import com.socialgrid.service.PostService;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

// A full application context on a throwaway Postgres, so schema.sql's foreign keys and the real SQL are in play.
// Nothing here runs inside a test transaction: each service call commits, as it does in production.
@SpringBootTest
@Import(TestDatabaseConfig.class)
abstract class PostgresIntegrationTest {

    protected static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 1, 2, 3};

    @Autowired
    protected JdbcTemplate jdbc;
    @Autowired
    protected UserRepository userRepository;
    @Autowired
    protected PostService postService;
    @Autowired
    protected CommentService commentService;
    @Autowired
    protected LikeService likeService;
    @Autowired
    protected FollowService followService;

    // Test classes share one context and so one database.
    @BeforeEach
    void emptyTheDatabase() {
        jdbc.execute("TRUNCATE TABLE likes, comments, post_images, follows, profiles, posts, users RESTART IDENTITY CASCADE");
    }

    protected Integer user(String username) {
        return userRepository.save(new User(username, "hash", username + "@example.com")).getId();
    }

    protected Integer post(Integer authorId) {
        return post(authorId, null);
    }

    protected Integer post(Integer authorId, String caption) {
        return postService.createPost(authorId, new ImageService.ProcessedImage(JPEG, 640, 480), caption).postId();
    }

    protected Integer comment(Integer authorId, Integer postId, String message) {
        return commentService.createComment(authorId, postId, new CommentRequest(message)).commentId();
    }

    protected long rows(String table, String idColumn, Integer id) {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE " + idColumn + " = ?", Long.class, id);
        return count == null ? 0 : count;
    }
}
