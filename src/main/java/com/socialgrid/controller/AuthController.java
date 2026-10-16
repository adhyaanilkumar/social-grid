package com.socialgrid.controller;

import com.socialgrid.config.SecurityUser;
import com.socialgrid.dto.LoginRequest;
import com.socialgrid.dto.RegisterRequest;
import com.socialgrid.dto.UserResponse;
import com.socialgrid.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

// Logout has no method here: Spring Security's logout filter answers POST /api/auth/logout (see SecurityConfig).
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;
    private final SecurityContextRepository securityContextRepository;

    public AuthController(UserService userService, SecurityContextRepository securityContextRepository) {
        this.userService = userService;
        this.securityContextRepository = securityContextRepository;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody RegisterRequest request) {
        return userService.register(request);
    }

    // Wrong credentials throw BadCredentialsException, which GlobalExceptionHandler turns into a 401.
    @PostMapping("/login")
    public UserResponse login(@Valid @RequestBody LoginRequest body,
                              HttpServletRequest request, HttpServletResponse response) {
        Authentication authentication = userService.authenticate(body);

        // Give the session a new ID, so an ID an attacker planted before login is useless afterwards
        // (session fixation).
        request.getSession(true);
        request.changeSessionId();

        // Store the logged-in user in the session. Spring Security 6 doesn't do this for a custom login
        // endpoint; without it the next request would arrive logged out.
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);

        SecurityUser me = (SecurityUser) authentication.getPrincipal();
        return userService.getUser(me.getId());
    }

    // Who is logged in? React calls this on page load: 200 means a live session, 401 means logged out.
    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal SecurityUser me) {
        return userService.getUser(me.getId());
    }
}
