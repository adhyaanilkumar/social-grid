package com.socialgrid.controller;

import com.socialgrid.config.CorsConfig;
import com.socialgrid.config.SecurityConfig;
import com.socialgrid.config.SecurityUser;
import com.socialgrid.dto.EmailUpdateRequest;
import com.socialgrid.dto.PostPage;
import com.socialgrid.dto.PostView;
import com.socialgrid.dto.ProfileResponse;
import com.socialgrid.dto.ProfileUpdateRequest;
import com.socialgrid.dto.UserResponse;
import com.socialgrid.dto.UserSummary;
import com.socialgrid.entity.FollowId;
import com.socialgrid.entity.Follows;
import com.socialgrid.entity.User;
import com.socialgrid.exception.BadRequestException;
import com.socialgrid.exception.ConflictException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.service.FeedService;
import com.socialgrid.service.FollowService;
import com.socialgrid.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(UserController.class)
@Import({SecurityConfig.class, CorsConfig.class})
class UserControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private UserService userService;
    @MockitoBean
    private FollowService followService;
    @MockitoBean
    private FeedService feedService;

    // SecurityConfig's AuthenticationManager needs one; the @WebMvcTest slice doesn't load @Service beans.
    @MockitoBean
    private UserDetailsService userDetailsService;

    private static SecurityUser alice() {
        User user = new User("alice", "hash", "alice@example.com");
        ReflectionTestUtils.setField(user, "id", 1);
        return new SecurityUser(user);
    }

    // ---- Search ----

    @Test
    void searchReturnsSummariesWithoutEmail() throws Exception {
        when(userService.searchUsers("bo", 1)).thenReturn(List.of(new UserSummary(2, "bob")));

        mvc.perform(get("/api/users/search").param("q", "bo").with(user(alice())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(2))
                .andExpect(jsonPath("$[0].username").value("bob"))
                .andExpect(jsonPath("$[0].email").doesNotExist());
    }

    @Test
    void searchWithoutQueryIs200Empty() throws Exception {
        when(userService.searchUsers(null, 1)).thenReturn(List.of());

        mvc.perform(get("/api/users/search").with(user(alice())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        verify(userService).searchUsers(null, 1);
    }

    @Test
    void searchLoggedOutIs401() throws Exception {
        mvc.perform(get("/api/users/search").param("q", "bo"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
        verifyNoInteractions(userService);
    }

    // ---- Profile ----

    @Test
    void profilePassesTheViewerAndHasNoEmail() throws Exception {
        when(userService.getProfile("bob", 1)).thenReturn(
                new ProfileResponse(2, "bob", "Bob", "Smith", "Bio", null, 5, 7, 3, true));

        mvc.perform(get("/api/users/bob/profile").with(user(alice())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(2))
                .andExpect(jsonPath("$.username").value("bob"))
                .andExpect(jsonPath("$.firstName").value("Bob"))
                .andExpect(jsonPath("$.lastName").value("Smith"))
                .andExpect(jsonPath("$.bio").value("Bio"))
                .andExpect(jsonPath("$.postCount").value(5))
                .andExpect(jsonPath("$.followerCount").value(7))
                .andExpect(jsonPath("$.followingCount").value(3))
                .andExpect(jsonPath("$.followedByMe").value(true))
                .andExpect(jsonPath("$.email").doesNotExist())
                .andExpect(jsonPath("$.password").doesNotExist());
    }

    @Test
    void unknownProfileIs404() throws Exception {
        when(userService.getProfile("ghost", 1)).thenThrow(new NotFoundException("User not found"));

        mvc.perform(get("/api/users/ghost/profile").with(user(alice())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void profileLoggedOutIs401() throws Exception {
        mvc.perform(get("/api/users/bob/profile"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(userService);
    }

    // ---- A user's posts ----

    @Test
    void userPostsReturnsThePage() throws Exception {
        when(feedService.getUserPosts(1, "bob", 50, 10)).thenReturn(new PostPage(
                List.of(new PostView(9, 2, "bob", "/api/posts/9/image", null, 640, 480, 0, 0, false)), 9));

        mvc.perform(get("/api/users/bob/posts").param("before", "50").param("limit", "10").with(user(alice())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].postId").value(9))
                .andExpect(jsonPath("$.nextCursor").value(9));
    }

    @Test
    void userPostsForUnknownUserIs404() throws Exception {
        when(feedService.getUserPosts(1, "ghost", null, null)).thenThrow(new NotFoundException("User not found"));

        mvc.perform(get("/api/users/ghost/posts").with(user(alice())))
                .andExpect(status().isNotFound());
    }

    @Test
    void userPostsWithNonNumericBeforeIs400() throws Exception {
        mvc.perform(get("/api/users/bob/posts").param("before", "abc").with(user(alice())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Malformed request"));
        verifyNoInteractions(feedService);
    }

    @Test
    void userPostsWithNonNumericLimitIs400() throws Exception {
        mvc.perform(get("/api/users/bob/posts").param("limit", "abc").with(user(alice())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Malformed request"));
        verifyNoInteractions(feedService);
    }

    @Test
    void userPostsLoggedOutIs401() throws Exception {
        mvc.perform(get("/api/users/bob/posts"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(feedService);
    }

    // ---- Own account ----

    private static MockHttpServletRequestBuilder putJson(String path, String body) {
        return put(path).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    @Test
    void updateProfileReturnsIt() throws Exception {
        when(userService.updateProfile(eq(1), any(ProfileUpdateRequest.class))).thenReturn(
                new ProfileResponse(1, "alice", null, null, "Bio", null, 0, 0, 0, false));

        mvc.perform(putJson("/api/users/me/profile", "{\"bio\":\"Bio\"}").with(csrf()).with(user(alice())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bio").value("Bio"));
    }

    @Test
    void bioOverTheLimitIs400() throws Exception {
        String body = "{\"bio\":\"" + "x".repeat(501) + "\"}";

        mvc.perform(putJson("/api/users/me/profile", body).with(csrf()).with(user(alice())))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(userService);
    }

    @Test
    void updateProfileLoggedOutIs401() throws Exception {
        mvc.perform(putJson("/api/users/me/profile", "{}").with(csrf()))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(userService);
    }

    @Test
    void updateProfileWithoutCsrfIs403() throws Exception {
        mvc.perform(putJson("/api/users/me/profile", "{}").with(user(alice())))
                .andExpect(status().isForbidden());
        verifyNoInteractions(userService);
    }

    @Test
    void updateEmailReturnsTheUser() throws Exception {
        when(userService.updateEmail(eq(1), any(EmailUpdateRequest.class)))
                .thenReturn(new UserResponse(1, "alice", "new@example.com"));

        mvc.perform(putJson("/api/users/me/email", "{\"email\":\"new@example.com\"}").with(csrf()).with(user(alice())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("new@example.com"));
    }

    @Test
    void invalidEmailIs400() throws Exception {
        mvc.perform(putJson("/api/users/me/email", "{\"email\":\"nope\"}").with(csrf()).with(user(alice())))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(userService);
    }

    @Test
    void updateEmailLoggedOutIs401() throws Exception {
        mvc.perform(putJson("/api/users/me/email", "{\"email\":\"new@example.com\"}").with(csrf()))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(userService);
    }

    @Test
    void updateEmailWithoutCsrfIs403() throws Exception {
        mvc.perform(putJson("/api/users/me/email", "{\"email\":\"new@example.com\"}").with(user(alice())))
                .andExpect(status().isForbidden());
        verifyNoInteractions(userService);
    }

    // ---- Follow and unfollow ----

    @Test
    void followIs201() throws Exception {
        when(followService.follow(1, 2)).thenReturn(new Follows(new FollowId(1, 2)));

        mvc.perform(post("/api/users/2/follow").with(csrf()).with(user(alice())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.followerId").value(1))
                .andExpect(jsonPath("$.followeeId").value(2));
    }

    @Test
    void followingYourselfIs400() throws Exception {
        when(followService.follow(1, 1)).thenThrow(new BadRequestException("Cannot follow yourself"));

        mvc.perform(post("/api/users/1/follow").with(csrf()).with(user(alice())))
                .andExpect(status().isBadRequest());
    }

    @Test
    void followingTwiceIs409() throws Exception {
        when(followService.follow(1, 2)).thenThrow(new ConflictException("Already following"));

        mvc.perform(post("/api/users/2/follow").with(csrf()).with(user(alice())))
                .andExpect(status().isConflict());
    }

    @Test
    void followingUnknownUserIs404() throws Exception {
        when(followService.follow(1, 2)).thenThrow(new NotFoundException("User not found"));

        mvc.perform(post("/api/users/2/follow").with(csrf()).with(user(alice())))
                .andExpect(status().isNotFound());
    }

    @Test
    void followWithNonNumericIdIs400() throws Exception {
        mvc.perform(post("/api/users/abc/follow").with(csrf()).with(user(alice())))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(followService);
    }

    @Test
    void followLoggedOutIs401() throws Exception {
        mvc.perform(post("/api/users/2/follow").with(csrf()))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(followService);
    }

    @Test
    void followWithoutCsrfIs403() throws Exception {
        mvc.perform(post("/api/users/2/follow").with(user(alice())))
                .andExpect(status().isForbidden());
        verifyNoInteractions(followService);
    }

    @Test
    void unfollowIs204() throws Exception {
        mvc.perform(delete("/api/users/2/follow").with(csrf()).with(user(alice())))
                .andExpect(status().isNoContent());
        verify(followService).unfollow(1, 2);
    }

    @Test
    void unfollowWhenNotFollowingIs404() throws Exception {
        doThrow(new NotFoundException("Not following")).when(followService).unfollow(1, 2);

        mvc.perform(delete("/api/users/2/follow").with(csrf()).with(user(alice())))
                .andExpect(status().isNotFound());
    }

    @Test
    void unfollowLoggedOutIs401() throws Exception {
        mvc.perform(delete("/api/users/2/follow").with(csrf()))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(followService);
    }

    @Test
    void unfollowWithoutCsrfIs403() throws Exception {
        mvc.perform(delete("/api/users/2/follow").with(user(alice())))
                .andExpect(status().isForbidden());
        verifyNoInteractions(followService);
    }
}
