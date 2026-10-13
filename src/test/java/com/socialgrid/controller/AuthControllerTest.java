package com.socialgrid.controller;

import com.socialgrid.config.CorsConfig;
import com.socialgrid.config.SecurityConfig;
import com.socialgrid.dto.RegisterRequest;
import com.socialgrid.dto.UserResponse;
import com.socialgrid.exception.ConflictException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Real security and CORS config, so /register is reached anonymously the way a browser would hit it.
@WebMvcTest(AuthController.class)
@Import({SecurityConfig.class, CorsConfig.class})
class AuthControllerTest {

    private static final String VALID =
            "{\"username\":\"alice\",\"password\":\"password1\",\"email\":\"alice@example.com\"}";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private UserService userService;

    private ResultActions register(String json) throws Exception {
        return mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(json));
    }

    @Test
    void registerReturns201WithUser() throws Exception {
        when(userService.register(any(RegisterRequest.class)))
                .thenReturn(new UserResponse(7, "alice", "alice@example.com"));

        register(VALID)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.username").value("alice"))
                .andExpect(jsonPath("$.email").value("alice@example.com"))
                .andExpect(jsonPath("$.password").doesNotExist());
    }

    @Test
    void blankFieldsGiveRequiredMessages() throws Exception {
        register("{\"username\":\"\",\"password\":\"\",\"email\":\"\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Bad Request"))
                .andExpect(jsonPath("$.fieldErrors.length()").value(3))
                .andExpect(jsonPath("$.fieldErrors.username").value("Username is required"))
                .andExpect(jsonPath("$.fieldErrors.password").value("Password is required"))
                .andExpect(jsonPath("$.fieldErrors.email").value("Email is required"));
        verify(userService, never()).register(any());
    }

    @Test
    void badValuesGiveFormatMessages() throws Exception {
        register("{\"username\":\"ab\",\"password\":\"short\",\"email\":\"not-an-email\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.username").value("Username must be 3–30 characters"))
                .andExpect(jsonPath("$.fieldErrors.password").value("Password must be 8–72 characters"))
                .andExpect(jsonPath("$.fieldErrors.email").value("Enter a valid email address"));
    }

    @Test
    void onlyBrokenFieldsAppear() throws Exception {
        register("{\"username\":\"alice\",\"password\":\"password1\",\"email\":\"nope\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.length()").value(1))
                .andExpect(jsonPath("$.fieldErrors.email").value("Enter a valid email address"));
    }

    @Test
    void duplicateUsernameIs409OnUsername() throws Exception {
        when(userService.register(any())).thenThrow(new ConflictException("username", "Username already taken"));

        register(VALID)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Username already taken"))
                .andExpect(jsonPath("$.fieldErrors.length()").value(1))
                .andExpect(jsonPath("$.fieldErrors.username").value("Username already taken"));
    }

    @Test
    void duplicateEmailIs409OnEmail() throws Exception {
        when(userService.register(any())).thenThrow(new ConflictException("email", "Email already registered"));

        register(VALID)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.fieldErrors.length()").value(1))
                .andExpect(jsonPath("$.fieldErrors.email").value("Email already registered"));
    }

    @Test
    void fieldlessConflictHasNoFieldErrorsKey() throws Exception {
        when(userService.register(any())).thenThrow(new ConflictException("Something clashed"));

        register(VALID)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Something clashed"))
                .andExpect(jsonPath("$.fieldErrors").doesNotExist());
    }

    @Test
    void notFoundHasNoFieldErrorsKey() throws Exception {
        when(userService.register(any())).thenThrow(new NotFoundException("User not found"));

        register(VALID)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.fieldErrors").doesNotExist());
    }

    @Test
    void malformedJsonHasNoFieldErrorsKey() throws Exception {
        register("{\"username\":")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Malformed request"))
                .andExpect(jsonPath("$.fieldErrors").doesNotExist());
    }
}
