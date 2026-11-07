package com.socialgrid.controller;

import com.socialgrid.config.CorsConfig;
import com.socialgrid.config.SecurityConfig;
import com.socialgrid.config.SecurityUser;
import com.socialgrid.dto.CommentRequest;
import com.socialgrid.dto.CommentResponse;
import com.socialgrid.dto.PostResponse;
import com.socialgrid.dto.PostUpdateRequest;
import com.socialgrid.entity.Like;
import com.socialgrid.entity.LikeId;
import com.socialgrid.entity.User;
import com.socialgrid.exception.BadRequestException;
import com.socialgrid.exception.ConflictException;
import com.socialgrid.exception.ForbiddenException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.service.CommentService;
import com.socialgrid.service.ImageService;
import com.socialgrid.service.LikeService;
import com.socialgrid.service.PostService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(PostController.class)
@Import({SecurityConfig.class, CorsConfig.class})
class PostControllerTest {

    private static final byte[] UPLOAD = {9, 9, 9};
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final ImageService.ProcessedImage PROCESSED = new ImageService.ProcessedImage(JPEG, 640, 480);
    private static final MockMultipartFile IMAGE =
            new MockMultipartFile("image", "photo.jpg", "image/jpeg", UPLOAD);
    private static final String COMMENT = "{\"message\":\"nice\"}";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private PostService postService;
    @MockitoBean
    private CommentService commentService;
    @MockitoBean
    private LikeService likeService;
    @MockitoBean
    private ImageService imageService;

    // SecurityConfig's AuthenticationManager needs one; the @WebMvcTest slice doesn't load @Service beans.
    @MockitoBean
    private UserDetailsService userDetailsService;

    private static SecurityUser alice() {
        User user = new User("alice", "hash", "alice@example.com");
        ReflectionTestUtils.setField(user, "id", 1);
        return new SecurityUser(user);
    }

    private static MockHttpServletRequestBuilder jsonPost(String path, String body) {
        return post(path).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    // ---- Create a post (multipart) ----

    @Test
    void createPostProcessesThePhotoThenSaves() throws Exception {
        when(imageService.normalizeToJpeg(UPLOAD)).thenReturn(PROCESSED);
        when(postService.createPost(1, PROCESSED, "hello"))
                .thenReturn(new PostResponse(42, 1, "/api/posts/42/image", "hello", 0));

        mvc.perform(multipart("/api/posts").file(IMAGE).param("caption", "hello").with(csrf()).with(user(alice())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.postId").value(42))
                .andExpect(jsonPath("$.authorId").value(1))
                .andExpect(jsonPath("$.mediaUrl").value("/api/posts/42/image"))
                .andExpect(jsonPath("$.caption").value("hello"))
                .andExpect(jsonPath("$.likeCount").value(0));
    }

    @Test
    void captionIsOptional() throws Exception {
        when(imageService.normalizeToJpeg(UPLOAD)).thenReturn(PROCESSED);
        when(postService.createPost(1, PROCESSED, null))
                .thenReturn(new PostResponse(42, 1, "/api/posts/42/image", null, 0));

        mvc.perform(multipart("/api/posts").file(IMAGE).with(csrf()).with(user(alice())))
                .andExpect(status().isCreated());
        verify(postService).createPost(1, PROCESSED, null);
    }

    @Test
    void createPostWithoutPhotoAsksForOne() throws Exception {
        mvc.perform(multipart("/api/posts").param("caption", "hello").with(csrf()).with(user(alice())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value("Choose a photo to post"));
        verifyNoInteractions(postService);
    }

    @Test
    void createPostWithBadFileIs400AndSavesNothing() throws Exception {
        when(imageService.normalizeToJpeg(UPLOAD)).thenThrow(new BadRequestException("Upload a JPEG or PNG photo"));

        mvc.perform(multipart("/api/posts").file(IMAGE).with(csrf()).with(user(alice())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Upload a JPEG or PNG photo"));
        verifyNoInteractions(postService);
    }

    @Test
    void createPostWithJsonIs415() throws Exception {
        mvc.perform(jsonPost("/api/posts", "{\"caption\":\"hello\"}").with(csrf()).with(user(alice())))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.status").value(415));
        verifyNoInteractions(postService, imageService);
    }

    @Test
    void createPostLoggedOutIs401() throws Exception {
        mvc.perform(multipart("/api/posts").file(IMAGE).with(csrf()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
        verifyNoInteractions(postService, imageService);
    }

    @Test
    void createPostWithoutCsrfIs403() throws Exception {
        mvc.perform(multipart("/api/posts").file(IMAGE).with(user(alice())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
        verifyNoInteractions(postService, imageService);
    }

    // ---- The photo ----

    @Test
    void imageIsJpegWithPrivateOneDayCaching() throws Exception {
        when(postService.getImage(42)).thenReturn(JPEG);

        mvc.perform(get("/api/posts/42/image").accept("image/*").with(user(alice())))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_JPEG))
                .andExpect(content().bytes(JPEG))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "max-age=86400, private"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }

    @Test
    void imageLoggedOutIs401() throws Exception {
        mvc.perform(get("/api/posts/42/image"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(postService);
    }

    @Test
    void missingImageIs404() throws Exception {
        when(postService.getImage(42)).thenThrow(new NotFoundException("Photo not found"));

        mvc.perform(get("/api/posts/42/image").with(user(alice())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void nonNumericPostIdIs400() throws Exception {
        mvc.perform(get("/api/posts/abc/image").with(user(alice())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Malformed request"));
    }

    // ---- Delete a post ----

    @Test
    void deletePostIs204() throws Exception {
        mvc.perform(delete("/api/posts/42").with(csrf()).with(user(alice())))
                .andExpect(status().isNoContent());
        verify(postService).deletePost(1, 42);
    }

    @Test
    void deletingSomeoneElsesPostIs403() throws Exception {
        doThrow(new ForbiddenException("Only the author can modify this post")).when(postService).deletePost(1, 42);

        mvc.perform(delete("/api/posts/42").with(csrf()).with(user(alice())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    void deletingMissingPostIs404() throws Exception {
        doThrow(new NotFoundException("Post not found")).when(postService).deletePost(1, 42);

        mvc.perform(delete("/api/posts/42").with(csrf()).with(user(alice())))
                .andExpect(status().isNotFound());
    }

    @Test
    void deletePostLoggedOutIs401() throws Exception {
        mvc.perform(delete("/api/posts/42").with(csrf()))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(postService);
    }

    @Test
    void deletePostWithoutCsrfIs403() throws Exception {
        mvc.perform(delete("/api/posts/42").with(user(alice())))
                .andExpect(status().isForbidden());
        verifyNoInteractions(postService);
    }

    // ---- Read and edit a post ----

    @Test
    void getPostReturnsIt() throws Exception {
        when(postService.getPost(42)).thenReturn(new PostResponse(42, 1, "/api/posts/42/image", "hi", 2));

        mvc.perform(get("/api/posts/42").with(user(alice())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.postId").value(42))
                .andExpect(jsonPath("$.likeCount").value(2));
    }

    @Test
    void getMissingPostIs404() throws Exception {
        when(postService.getPost(42)).thenThrow(new NotFoundException("Post not found"));

        mvc.perform(get("/api/posts/42").with(user(alice())))
                .andExpect(status().isNotFound());
    }

    @Test
    void editPostReturnsIt() throws Exception {
        when(postService.updatePost(eq(1), eq(42), any(PostUpdateRequest.class)))
                .thenReturn(new PostResponse(42, 1, "/api/posts/42/image", "new", 0));

        mvc.perform(put("/api/posts/42").contentType(MediaType.APPLICATION_JSON).content("{\"caption\":\"new\"}")
                        .with(csrf()).with(user(alice())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.caption").value("new"));
    }

    @Test
    void editPostLoggedOutIs401() throws Exception {
        mvc.perform(put("/api/posts/42").contentType(MediaType.APPLICATION_JSON).content("{}").with(csrf()))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(postService);
    }

    @Test
    void editPostWithoutCsrfIs403() throws Exception {
        mvc.perform(put("/api/posts/42").contentType(MediaType.APPLICATION_JSON).content("{}").with(user(alice())))
                .andExpect(status().isForbidden());
        verifyNoInteractions(postService);
    }

    // ---- Comments on a post ----

    @Test
    void createCommentIs201WithAuthorUsername() throws Exception {
        when(commentService.createComment(eq(1), eq(42), any(CommentRequest.class)))
                .thenReturn(new CommentResponse(7, 1, "alice", 42, "nice"));

        mvc.perform(jsonPost("/api/posts/42/comments", COMMENT).with(csrf()).with(user(alice())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.commentId").value(7))
                .andExpect(jsonPath("$.authorId").value(1))
                .andExpect(jsonPath("$.authorUsername").value("alice"))
                .andExpect(jsonPath("$.postId").value(42))
                .andExpect(jsonPath("$.message").value("nice"));
    }

    @Test
    void blankCommentIs400() throws Exception {
        mvc.perform(jsonPost("/api/posts/42/comments", "{\"message\":\"  \"}").with(csrf()).with(user(alice())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.message").exists());
        verifyNoInteractions(commentService);
    }

    @Test
    void commentOverTheLimitIs400() throws Exception {
        String body = "{\"message\":\"" + "x".repeat(1001) + "\"}";

        mvc.perform(jsonPost("/api/posts/42/comments", body).with(csrf()).with(user(alice())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.message").exists());
        verifyNoInteractions(commentService);
    }

    @Test
    void commentAtTheLimitIsAccepted() throws Exception {
        String body = "{\"message\":\"" + "x".repeat(1000) + "\"}";
        when(commentService.createComment(eq(1), eq(42), any(CommentRequest.class)))
                .thenReturn(new CommentResponse(7, 1, "alice", 42, "x".repeat(1000)));

        mvc.perform(jsonPost("/api/posts/42/comments", body).with(csrf()).with(user(alice())))
                .andExpect(status().isCreated());
    }

    @Test
    void commentOnMissingPostIs404() throws Exception {
        when(commentService.createComment(eq(1), eq(42), any(CommentRequest.class)))
                .thenThrow(new NotFoundException("Post not found"));

        mvc.perform(jsonPost("/api/posts/42/comments", COMMENT).with(csrf()).with(user(alice())))
                .andExpect(status().isNotFound());
    }

    @Test
    void createCommentLoggedOutIs401() throws Exception {
        mvc.perform(jsonPost("/api/posts/42/comments", COMMENT).with(csrf()))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(commentService);
    }

    @Test
    void createCommentWithoutCsrfIs403() throws Exception {
        mvc.perform(jsonPost("/api/posts/42/comments", COMMENT).with(user(alice())))
                .andExpect(status().isForbidden());
        verifyNoInteractions(commentService);
    }

    @Test
    void readingCommentsIncludesAuthorUsername() throws Exception {
        when(commentService.getCommentsForPost(42)).thenReturn(List.of(
                new CommentResponse(7, 2, "bob", 42, "first"),
                new CommentResponse(8, 3, "carol", 42, "second")));

        mvc.perform(get("/api/posts/42/comments").with(user(alice())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].authorUsername").value("bob"))
                .andExpect(jsonPath("$[1].authorUsername").value("carol"));
    }

    @Test
    void readingCommentsLoggedOutIs401() throws Exception {
        mvc.perform(get("/api/posts/42/comments"))
                .andExpect(status().isUnauthorized());
    }

    // ---- Likes ----

    @Test
    void likeIs201() throws Exception {
        when(likeService.createLike(1, 42)).thenReturn(new Like(new LikeId(42, 1)));

        mvc.perform(post("/api/posts/42/likes").with(csrf()).with(user(alice())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.postId").value(42))
                .andExpect(jsonPath("$.userId").value(1));
    }

    @Test
    void likingTwiceIs409() throws Exception {
        when(likeService.createLike(1, 42)).thenThrow(new ConflictException("Post already liked"));

        mvc.perform(post("/api/posts/42/likes").with(csrf()).with(user(alice())))
                .andExpect(status().isConflict());
    }

    @Test
    void unlikeIs204() throws Exception {
        mvc.perform(delete("/api/posts/42/likes").with(csrf()).with(user(alice())))
                .andExpect(status().isNoContent());
        verify(likeService).deleteLike(1, 42);
    }

    @Test
    void unlikeWithNoLikeIs404() throws Exception {
        doThrow(new NotFoundException("Like not found")).when(likeService).deleteLike(1, 42);

        mvc.perform(delete("/api/posts/42/likes").with(csrf()).with(user(alice())))
                .andExpect(status().isNotFound());
    }

    @Test
    void likeLoggedOutIs401() throws Exception {
        mvc.perform(post("/api/posts/42/likes").with(csrf()))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(likeService);
    }

    @Test
    void likeWithoutCsrfIs403() throws Exception {
        mvc.perform(post("/api/posts/42/likes").with(user(alice())))
                .andExpect(status().isForbidden());
        verifyNoInteractions(likeService);
    }

    @Test
    void unlikeWithoutCsrfIs403() throws Exception {
        mvc.perform(delete("/api/posts/42/likes").with(user(alice())))
                .andExpect(status().isForbidden());
        verifyNoInteractions(likeService);
    }
}
