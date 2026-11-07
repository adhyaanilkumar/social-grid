package com.socialgrid.integration;

import com.socialgrid.dto.CommentResponse;
import com.socialgrid.entity.Comment;
import com.socialgrid.entity.User;
import com.socialgrid.exception.ForbiddenException;
import com.socialgrid.exception.GlobalExceptionHandler;
import com.socialgrid.repository.CommentRepository;
import com.socialgrid.service.ImageService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import javax.imageio.ImageIO;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

// FR2, FR9, FR13. Deleting a post relies on ON DELETE CASCADE in schema.sql, which only a real database can show.
class CommentsAndDeletionIntegrationTest extends PostgresIntegrationTest {

    @Autowired
    private CommentRepository commentRepository;
    @Autowired
    private ImageService imageService;

    private final GlobalExceptionHandler errorHandler = new GlobalExceptionHandler();

    // ---- Comments ----

    @Test
    void commentsComeBackOldestFirstWithUsernames() {
        Integer alice = user("alice");
        Integer bob = user("bob");
        Integer postId = post(alice);
        Integer otherPost = post(alice);
        Integer first = comment(bob, postId, "first");
        comment(alice, otherPost, "elsewhere");
        Integer second = comment(alice, postId, "second");
        Integer third = comment(bob, postId, "third");

        List<CommentResponse> comments = commentService.getCommentsForPost(postId);

        assertThat(comments).extracting(CommentResponse::commentId).containsExactly(first, second, third);
        assertThat(comments).extracting(CommentResponse::authorUsername).containsExactly("bob", "alice", "bob");
        assertThat(comments).extracting(CommentResponse::message).containsExactly("first", "second", "third");
        assertThat(comments).extracting(CommentResponse::postId).containsOnly(postId);
    }

    @Test
    void commentOfTheMaximumLengthIsStored() {
        Integer alice = user("alice");
        Integer postId = post(alice);
        String longest = "x".repeat(1000);

        comment(alice, postId, longest);

        assertThat(commentService.getCommentsForPost(postId).getFirst().message()).isEqualTo(longest);
    }

    // ---- Posts and photos ----

    @Test
    void captionOfTheMaximumLengthIsStored() {
        Integer alice = user("alice");
        String longest = "x".repeat(2200);

        Integer postId = post(alice, longest);

        assertThat(postService.getPost(postId).caption()).isEqualTo(longest);
    }

    @Test
    void mediaUrlAndPhotoSurviveTheTransaction() {
        Integer alice = user("alice");

        Integer postId = post(alice);

        assertThat(postService.getPost(postId).mediaUrl()).isEqualTo("/api/posts/" + postId + "/image");
        assertThat(postService.getImage(postId)).isEqualTo(JPEG);
    }

    // The whole path from upload to stored bytes, with a real image through the real bytea column.
    @Test
    void aProcessedUploadReadsBackAsTheSameJpeg() throws IOException {
        Integer alice = user("alice");
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2000, 1000, BufferedImage.TYPE_INT_RGB), "png", png);
        ImageService.ProcessedImage processed = imageService.normalizeToJpeg(png.toByteArray());

        Integer postId = postService.createPost(alice, processed, null).postId();

        byte[] stored = postService.getImage(postId);
        assertThat(stored).isEqualTo(processed.jpeg());
        BufferedImage read = ImageIO.read(new ByteArrayInputStream(stored));
        assertThat(read.getWidth()).isEqualTo(1080);
        assertThat(read.getHeight()).isEqualTo(540);
    }

    // ---- Deleting a post ----

    @Test
    void deletingAPostRemovesItsLikesCommentsAndPhoto() {
        Integer alice = user("alice");
        Integer bob = user("bob");
        Integer doomed = post(alice);
        Integer kept = post(alice);
        likeService.createLike(bob, doomed);
        likeService.createLike(alice, doomed);
        comment(bob, doomed, "gone");
        likeService.createLike(bob, kept);
        comment(bob, kept, "stays");
        assertThat(rows("post_images", "post_id", doomed)).isEqualTo(1);

        postService.deletePost(alice, doomed);

        assertThat(rows("posts", "post_id", doomed)).isZero();
        assertThat(rows("likes", "post_id", doomed)).isZero();
        assertThat(rows("comments", "post_id", doomed)).isZero();
        assertThat(rows("post_images", "post_id", doomed)).isZero();

        assertThat(rows("posts", "post_id", kept)).isEqualTo(1);
        assertThat(rows("likes", "post_id", kept)).isEqualTo(1);
        assertThat(rows("comments", "post_id", kept)).isEqualTo(1);
        assertThat(rows("post_images", "post_id", kept)).isEqualTo(1);
    }

    @Test
    void someoneElseCannotDeleteAPostAndNothingIsRemoved() {
        Integer alice = user("alice");
        Integer bob = user("bob");
        Integer postId = post(alice);
        likeService.createLike(bob, postId);

        assertThatThrownBy(() -> postService.deletePost(bob, postId)).isInstanceOf(ForbiddenException.class);

        assertThat(rows("posts", "post_id", postId)).isEqualTo(1);
        assertThat(rows("likes", "post_id", postId)).isEqualTo(1);
        assertThat(rows("post_images", "post_id", postId)).isEqualTo(1);
    }

    // ---- Real Postgres errors through the error handler ----

    @Test
    void realForeignKeyViolationMapsTo404() {
        Integer alice = user("alice");

        DataIntegrityViolationException e = catchThrowableOfType(DataIntegrityViolationException.class,
                () -> commentRepository.saveAndFlush(new Comment(alice, 999_999, "orphan")));

        assertThat(e).as("the database refused the insert").isNotNull();
        assertThat(errorHandler.handleIntegrity(e).getStatusCode().value()).isEqualTo(404);
    }

    @Test
    void realUniqueViolationMapsTo409() {
        user("alice");

        DataIntegrityViolationException e = catchThrowableOfType(DataIntegrityViolationException.class,
                () -> userRepository.saveAndFlush(new User("alice", "hash", "other@example.com")));

        assertThat(e).as("the database refused the insert").isNotNull();
        assertThat(errorHandler.handleIntegrity(e).getStatusCode().value()).isEqualTo(409);
    }
}
