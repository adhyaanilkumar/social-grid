package com.socialgrid.controller;

import com.socialgrid.config.CorsConfig;
import com.socialgrid.config.SecurityConfig;
import com.socialgrid.dto.RegisterRequest;
import com.socialgrid.dto.UserResponse;
import com.socialgrid.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// A password over BCrypt's 72-byte limit must get a 400 with the size message in ErrorResponse, never reach the
// service (where BCrypt would throw and give a 500).
@WebMvcTest(AuthController.class)
@Import({SecurityConfig.class, CorsConfig.class})
class AuthRegisterPasswordBytesTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private UserService userService;

    @MockitoBean
    private UserDetailsService userDetailsService;

    private ResultActions register(String password) throws Exception {
        String json = "{\"username\":\"alice\",\"password\":\"" + password + "\",\"email\":\"alice@example.com\"}";
        return mvc.perform(post("/api/auth/register").with(csrf())
                .contentType(MediaType.APPLICATION_JSON).characterEncoding("UTF-8").content(json));
    }

    @Test
    void passwordOver72BytesButUnder72CharactersIs400WithSizeMessage() throws Exception {
        register("é".repeat(40))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.fieldErrors.password").value("Password must be 8–72 characters"))
                .andExpect(jsonPath("$.fieldErrors.length()").value(1));
        verifyNoInteractions(userService);
    }

    @Test
    void seventyTwoAsciiCharacterPasswordStillRegisters() throws Exception {
        when(userService.register(any(RegisterRequest.class)))
                .thenReturn(new UserResponse(7, "alice", "alice@example.com"));
        register("a".repeat(72)).andExpect(status().isCreated());
    }
}
