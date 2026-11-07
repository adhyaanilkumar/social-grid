package com.socialgrid.controller;

import com.socialgrid.config.CorsConfig;
import com.socialgrid.config.SecurityConfig;
import com.socialgrid.config.SecurityUser;
import com.socialgrid.dto.CommentRequest;
import com.socialgrid.dto.CommentResponse;
import com.socialgrid.entity.User;
import com.socialgrid.exception.ForbiddenException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.service.CommentService;
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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(CommentController.class)
@Import({SecurityConfig.class, CorsConfig.class})
class CommentControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private CommentService commentService;

    // SecurityConfig's AuthenticationManager needs one; the @WebMvcTest slice doesn't load @Service beans.
    @MockitoBean
    private UserDetailsService userDetailsService;

    private static SecurityUser alice() {
        User user = new User("alice", "hash", "alice@example.com");
        ReflectionTestUtils.setField(user, "id", 1);
        return new SecurityUser(user);
    }

    private static MockHttpServletRequestBuilder edit(String id, String message) {
        return put("/api/comments/" + id).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"" + message + "\"}");
    }

    @Test
    void deleteIs204() throws Exception {
        mvc.perform(delete("/api/comments/7").with(csrf()).with(user(alice())))
                .andExpect(status().isNoContent());
        verify(commentService).deleteComment(1, 7);
    }

    @Test
    void deletingSomeoneElsesCommentIs403() throws Exception {
        doThrow(new ForbiddenException("Only the author can modify this comment"))
                .when(commentService).deleteComment(1, 7);

        mvc.perform(delete("/api/comments/7").with(csrf()).with(user(alice())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    void deletingMissingCommentIs404() throws Exception {
        doThrow(new NotFoundException("Comment not found")).when(commentService).deleteComment(1, 7);

        mvc.perform(delete("/api/comments/7").with(csrf()).with(user(alice())))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteWithNonNumericIdIs400() throws Exception {
        mvc.perform(delete("/api/comments/abc").with(csrf()).with(user(alice())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Malformed request"));
        verifyNoInteractions(commentService);
    }

    @Test
    void deleteLoggedOutIs401() throws Exception {
        mvc.perform(delete("/api/comments/7").with(csrf()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
        verifyNoInteractions(commentService);
    }

    @Test
    void deleteWithoutCsrfIs403() throws Exception {
        mvc.perform(delete("/api/comments/7").with(user(alice())))
                .andExpect(status().isForbidden());
        verifyNoInteractions(commentService);
    }

    @Test
    void editReturnsTheComment() throws Exception {
        when(commentService.updateMessage(eq(1), eq(7), any(CommentRequest.class)))
                .thenReturn(new CommentResponse(7, 1, "alice", 42, "changed"));

        mvc.perform(edit("7", "changed").with(csrf()).with(user(alice())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.commentId").value(7))
                .andExpect(jsonPath("$.authorUsername").value("alice"))
                .andExpect(jsonPath("$.message").value("changed"));
    }

    @Test
    void editingSomeoneElsesCommentIs403() throws Exception {
        when(commentService.updateMessage(eq(1), eq(7), any(CommentRequest.class)))
                .thenThrow(new ForbiddenException("Only the author can modify this comment"));

        mvc.perform(edit("7", "changed").with(csrf()).with(user(alice())))
                .andExpect(status().isForbidden());
    }

    @Test
    void blankEditIs400() throws Exception {
        mvc.perform(edit("7", " ").with(csrf()).with(user(alice())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.message").exists());
        verifyNoInteractions(commentService);
    }

    @Test
    void editOverTheLimitIs400() throws Exception {
        mvc.perform(edit("7", "x".repeat(1001)).with(csrf()).with(user(alice())))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(commentService);
    }

    @Test
    void editLoggedOutIs401() throws Exception {
        mvc.perform(edit("7", "changed").with(csrf()))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(commentService);
    }

    @Test
    void editWithoutCsrfIs403() throws Exception {
        mvc.perform(edit("7", "changed").with(user(alice())))
                .andExpect(status().isForbidden());
        verifyNoInteractions(commentService);
    }
}
