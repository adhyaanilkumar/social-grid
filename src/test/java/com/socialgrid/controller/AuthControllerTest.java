package com.socialgrid.controller;

import com.socialgrid.config.CorsConfig;
import com.socialgrid.config.SecurityConfig;
import com.socialgrid.config.SecurityUser;
import com.socialgrid.dto.LoginRequest;
import com.socialgrid.dto.RegisterRequest;
import com.socialgrid.dto.UserResponse;
import com.socialgrid.entity.User;
import com.socialgrid.exception.ConflictException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.service.UserService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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

    // SecurityConfig's AuthenticationManager needs one; the @WebMvcTest slice doesn't load @Service beans.
    @MockitoBean
    private UserDetailsService userDetailsService;

    private ResultActions register(String json) throws Exception {
        return mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json));
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

    // ---- Login, session and logout (AD-264) ----

    private static final String LOGIN = "{\"identifier\":\"alice\",\"password\":\"password1\"}";

    // User has no id setter (the database assigns it), so tests set it directly.
    private static SecurityUser alice() {
        User user = new User("alice", "hash", "alice@example.com");
        ReflectionTestUtils.setField(user, "id", 7);
        return new SecurityUser(user);
    }

    // What a real AuthenticationManager hands back after a correct password.
    private void loginSucceeds() {
        SecurityUser alice = alice();
        when(userService.authenticate(any(LoginRequest.class)))
                .thenReturn(UsernamePasswordAuthenticationToken.authenticated(alice, null, alice.getAuthorities()));
        when(userService.getUser(7)).thenReturn(new UserResponse(7, "alice", "alice@example.com"));
    }

    private ResultActions login(String json, MockHttpSession session) throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf()).session(session)
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    @Test
    void loginReturnsUserAndStoresContextInSession() throws Exception {
        loginSucceeds();
        MockHttpSession session = new MockHttpSession();

        login(LOGIN, session)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.username").value("alice"))
                .andExpect(jsonPath("$.email").value("alice@example.com"))
                .andExpect(jsonPath("$.password").doesNotExist());

        SecurityContext saved = (SecurityContext) session.getAttribute(
                HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
        assertThat(saved).isNotNull();
        assertThat(((SecurityUser) saved.getAuthentication().getPrincipal()).getId()).isEqualTo(7);
    }

    // The point of the feature: the browser only sends the session cookie back, and that is enough.
    @Test
    void sessionFromLoginAuthenticatesMe() throws Exception {
        loginSucceeds();
        MockHttpSession session = new MockHttpSession();
        login(LOGIN, session).andExpect(status().isOk());

        mvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.username").value("alice"));
    }

    // Session fixation: an ID that existed before login must not be the one that is logged in.
    @Test
    void loginChangesSessionId() throws Exception {
        loginSucceeds();
        MockHttpSession session = new MockHttpSession(null, "planted-id");

        login(LOGIN, session).andExpect(status().isOk());

        assertThat(session.getId()).isNotEqualTo("planted-id");
    }

    @Test
    void loginPassesIdentifierAndPasswordToService() throws Exception {
        loginSucceeds();

        login(LOGIN, new MockHttpSession()).andExpect(status().isOk());

        verify(userService).authenticate(new LoginRequest("alice", "password1"));
    }

    @Test
    void badCredentialsGive401Json() throws Exception {
        when(userService.authenticate(any())).thenThrow(new BadCredentialsException("Bad credentials"));
        MockHttpSession session = new MockHttpSession();

        login(LOGIN, session)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.error").value("Unauthorized"))
                .andExpect(jsonPath("$.message").value("Invalid username/email or password"))
                .andExpect(jsonPath("$.fieldErrors").doesNotExist())
                .andExpect(header().doesNotExist("WWW-Authenticate"));
        assertThat(session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY)).isNull();
    }

    @Test
    void blankLoginFieldsGiveRequiredMessages() throws Exception {
        login("{\"identifier\":\"\",\"password\":\" \"}", new MockHttpSession())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.fieldErrors.length()").value(2))
                .andExpect(jsonPath("$.fieldErrors.identifier").value("Username or email is required"))
                .andExpect(jsonPath("$.fieldErrors.password").value("Password is required"));
        verify(userService, never()).authenticate(any());
    }

    @Test
    void missingLoginFieldsGiveRequiredMessages() throws Exception {
        login("{}", new MockHttpSession())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.identifier").value("Username or email is required"))
                .andExpect(jsonPath("$.fieldErrors.password").value("Password is required"));
        verify(userService, never()).authenticate(any());
    }

    @Test
    void loginWithoutCsrfIs403Json() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(LOGIN))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.error").value("Forbidden"))
                .andExpect(jsonPath("$.message").value("Request was refused. Refresh the page and try again."));
        verifyNoInteractions(userService);
    }

    // The real browser flow, without the csrf() shortcut: read the XSRF-TOKEN cookie from any response and
    // echo it in the X-XSRF-TOKEN header. Checks the token is sent raw (not masked), as React expects.
    // Fresh context: any earlier csrf() call swaps the shared CsrfFilter's cookie repository for a
    // session-based test one, after which no XSRF-TOKEN cookie is written.
    @Test
    @DirtiesContext(methodMode = DirtiesContext.MethodMode.BEFORE_METHOD)
    void xsrfCookieEchoedInHeaderIsAccepted() throws Exception {
        loginSucceeds();
        MvcResult first = mvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(cookie().exists("XSRF-TOKEN"))
                .andExpect(cookie().httpOnly("XSRF-TOKEN", false))
                .andReturn();
        String token = first.getResponse().getCookie("XSRF-TOKEN").getValue();

        mvc.perform(post("/api/auth/login").cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                        .contentType(MediaType.APPLICATION_JSON).content(LOGIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("alice"));
    }

    @Test
    @DirtiesContext(methodMode = DirtiesContext.MethodMode.BEFORE_METHOD)
    void wrongXsrfHeaderIs403() throws Exception {
        mvc.perform(post("/api/auth/login").cookie(new Cookie("XSRF-TOKEN", "real")).header("X-XSRF-TOKEN", "forged")
                        .contentType(MediaType.APPLICATION_JSON).content(LOGIN))
                .andExpect(status().isForbidden());
        verifyNoInteractions(userService);
    }

    // No WWW-Authenticate header: that header is what makes a browser pop up its own login dialog.
    @Test
    void meWithoutSessionIs401JsonWithoutBrowserPrompt() throws Exception {
        mvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.error").value("Unauthorized"))
                .andExpect(jsonPath("$.message").value("Log in to continue"))
                .andExpect(header().doesNotExist("WWW-Authenticate"));
        verifyNoInteractions(userService);
    }

    // HTTP Basic is gone: credentials in an Authorization header are ignored.
    @Test
    void basicAuthHeaderNoLongerLogsIn() throws Exception {
        mvc.perform(get("/api/auth/me").header("Authorization", "Basic YWxpY2U6cGFzc3dvcmQx"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Log in to continue"));
        verifyNoInteractions(userService);
    }

    @Test
    void meReturnsLoggedInUser() throws Exception {
        when(userService.getUser(7)).thenReturn(new UserResponse(7, "alice", "alice@example.com"));

        mvc.perform(get("/api/auth/me").with(user(alice())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.email").value("alice@example.com"));
    }

    @Test
    void logoutInvalidatesSessionAndDeletesCookie() throws Exception {
        loginSucceeds();
        MockHttpSession session = new MockHttpSession();
        login(LOGIN, session).andExpect(status().isOk());

        mvc.perform(post("/api/auth/logout").with(csrf()).session(session))
                .andExpect(status().isOk())
                .andExpect(cookie().maxAge("JSESSIONID", 0));

        assertThat(session.isInvalid()).isTrue();
        // Replaying the old session gets a fresh, empty one: logged out.
        mvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Log in to continue"));
    }

    @Test
    void logoutWithoutCsrfIs403AndKeepsSession() throws Exception {
        loginSucceeds();
        MockHttpSession session = new MockHttpSession();
        login(LOGIN, session).andExpect(status().isOk());

        mvc.perform(post("/api/auth/logout").session(session))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));

        assertThat(session.isInvalid()).isFalse();
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());
    }

    // Logging out with no session is harmless, so React can call it without checking first.
    @Test
    void logoutWithoutSessionIsStill200() throws Exception {
        mvc.perform(post("/api/auth/logout").with(csrf()))
                .andExpect(status().isOk());
    }

    // The old HTTP Basic login was GET /api/auth/login; it must no longer hand out a user.
    @Test
    void oldGetLoginNoLongerReturnsUser() throws Exception {
        mvc.perform(get("/api/auth/login"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.username").doesNotExist());

        mvc.perform(get("/api/auth/login").with(user(alice())))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.username").doesNotExist());
        verifyNoInteractions(userService);
    }
}
