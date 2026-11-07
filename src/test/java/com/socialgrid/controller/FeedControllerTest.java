package com.socialgrid.controller;

import com.socialgrid.config.CorsConfig;
import com.socialgrid.config.SecurityConfig;
import com.socialgrid.config.SecurityUser;
import com.socialgrid.dto.PostPage;
import com.socialgrid.dto.PostView;
import com.socialgrid.entity.User;
import com.socialgrid.service.FeedService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(FeedController.class)
@Import({SecurityConfig.class, CorsConfig.class})
class FeedControllerTest {

    private static final PostPage PAGE = new PostPage(
            List.of(new PostView(9, 2, "bob", "/api/posts/9/image", "hi", 640, 480, 3, 4, true)), 9);

    @Autowired
    private MockMvc mvc;

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

    @Test
    void homeReturnsThePageAsJson() throws Exception {
        when(feedService.getHomeFeed(1, 50, 10)).thenReturn(PAGE);

        mvc.perform(get("/api/feed/home").param("before", "50").param("limit", "10").with(user(alice())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nextCursor").value(9))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].postId").value(9))
                .andExpect(jsonPath("$.items[0].authorId").value(2))
                .andExpect(jsonPath("$.items[0].authorUsername").value("bob"))
                .andExpect(jsonPath("$.items[0].mediaUrl").value("/api/posts/9/image"))
                .andExpect(jsonPath("$.items[0].caption").value("hi"))
                .andExpect(jsonPath("$.items[0].width").value(640))
                .andExpect(jsonPath("$.items[0].height").value(480))
                .andExpect(jsonPath("$.items[0].likeCount").value(3))
                .andExpect(jsonPath("$.items[0].commentCount").value(4))
                .andExpect(jsonPath("$.items[0].likedByMe").value(true))
                .andExpect(jsonPath("$.items[0].email").doesNotExist());
    }

    @Test
    void homeWithoutParametersPassesNulls() throws Exception {
        when(feedService.getHomeFeed(1, null, null)).thenReturn(new PostPage(List.of(), null));

        mvc.perform(get("/api/feed/home").with(user(alice())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.nextCursor").isEmpty());
        verify(feedService).getHomeFeed(1, null, null);
    }

    @Test
    void exploreReturnsThePage() throws Exception {
        when(feedService.getExploreFeed(1, 50, 10)).thenReturn(PAGE);

        mvc.perform(get("/api/feed/explore").param("before", "50").param("limit", "10").with(user(alice())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].postId").value(9))
                .andExpect(jsonPath("$.nextCursor").value(9));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/feed/home", "/api/feed/explore"})
    void loggedOutIs401(String path) throws Exception {
        mvc.perform(get(path))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
        verifyNoInteractions(feedService);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/feed/home", "/api/feed/explore"})
    void nonNumericBeforeIs400(String path) throws Exception {
        mvc.perform(get(path).param("before", "abc").with(user(alice())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value("Malformed request"));
        verifyNoInteractions(feedService);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/feed/home", "/api/feed/explore"})
    void nonNumericLimitIs400(String path) throws Exception {
        mvc.perform(get(path).param("limit", "abc").with(user(alice())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Malformed request"));
        verifyNoInteractions(feedService);
    }

    @Test
    void beforeTooBigForAnIntegerIs400() throws Exception {
        mvc.perform(get("/api/feed/home").param("before", "99999999999").with(user(alice())))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(feedService);
    }
}
