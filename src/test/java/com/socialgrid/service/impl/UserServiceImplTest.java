package com.socialgrid.service.impl;

import com.socialgrid.dto.EmailUpdateRequest;
import com.socialgrid.dto.LoginRequest;
import com.socialgrid.dto.RegisterRequest;
import com.socialgrid.entity.User;
import com.socialgrid.exception.ConflictException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.repository.ProfileRepository;
import com.socialgrid.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceImplTest {

    @Mock
    private UserRepository userRepository;
    @Mock
    private ProfileRepository profileRepository;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private AuthenticationManager authenticationManager;
    @InjectMocks
    private UserServiceImpl service;

    private final RegisterRequest request = new RegisterRequest("alice", "password1", "alice@example.com");

    @Test
    void takenUsernameIsReportedOnUsername() {
        when(userRepository.existsByUsername("alice")).thenReturn(true);

        ConflictException e = catchThrowableOfType(ConflictException.class, () -> service.register(request));

        assertThat(e.getField()).isEqualTo("username");
        assertThat(e.getMessage()).isEqualTo("Username already taken");
        verify(userRepository, never()).save(any());
    }

    @Test
    void takenEmailIsReportedOnEmail() {
        when(userRepository.existsByUsername("alice")).thenReturn(false);
        when(userRepository.existsByEmail("alice@example.com")).thenReturn(true);

        ConflictException e = catchThrowableOfType(ConflictException.class, () -> service.register(request));

        assertThat(e.getField()).isEqualTo("email");
        assertThat(e.getMessage()).isEqualTo("Email already registered");
        verify(userRepository, never()).save(any());
    }

    // Only one field comes back when both clash: the username check runs first and the email is never looked at.
    @Test
    void usernameWinsWhenBothAreTaken() {
        when(userRepository.existsByUsername("alice")).thenReturn(true);

        ConflictException e = catchThrowableOfType(ConflictException.class, () -> service.register(request));

        assertThat(e.getField()).isEqualTo("username");
        verify(userRepository, never()).existsByEmail(anyString());
    }

    @Test
    void updateEmailToTakenAddressIsReportedOnEmail() {
        when(userRepository.findById(1)).thenReturn(Optional.of(new User("alice", "hash", "alice@example.com")));
        when(userRepository.existsByEmail("bob@example.com")).thenReturn(true);

        ConflictException e = catchThrowableOfType(ConflictException.class,
                () -> service.updateEmail(1, new EmailUpdateRequest("bob@example.com")));

        assertThat(e.getField()).isEqualTo("email");
        assertThat(e.getMessage()).isEqualTo("Email already registered");
    }

    @Test
    void updateEmailToOwnAddressIsNotAConflict() {
        when(userRepository.findById(1)).thenReturn(Optional.of(new User("alice", "hash", "alice@example.com")));

        assertThat(service.updateEmail(1, new EmailUpdateRequest("alice@example.com")).email())
                .isEqualTo("alice@example.com");
        verify(userRepository, never()).existsByEmail(anyString());
    }

    // The service only builds the "please check this" token; the AuthenticationManager does the checking.
    @Test
    void authenticateHandsCredentialsToAuthenticationManager() {
        Authentication result = UsernamePasswordAuthenticationToken.authenticated("alice", null, List.of());
        when(authenticationManager.authenticate(any())).thenReturn(result);

        assertThat(service.authenticate(new LoginRequest("alice@example.com", "password1"))).isSameAs(result);

        ArgumentCaptor<Authentication> sent = ArgumentCaptor.forClass(Authentication.class);
        verify(authenticationManager).authenticate(sent.capture());
        assertThat(sent.getValue()).isInstanceOf(UsernamePasswordAuthenticationToken.class);
        assertThat(sent.getValue().isAuthenticated()).isFalse();
        assertThat(sent.getValue().getPrincipal()).isEqualTo("alice@example.com");
        assertThat(sent.getValue().getCredentials()).isEqualTo("password1");
    }

    @Test
    void authenticatePropagatesBadCredentials() {
        when(authenticationManager.authenticate(any())).thenThrow(new BadCredentialsException("Bad credentials"));

        assertThatThrownBy(() -> service.authenticate(new LoginRequest("alice", "wrong")))
                .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void getUserReturnsUserWithoutPassword() {
        User user = new User("alice", "hash", "alice@example.com");
        ReflectionTestUtils.setField(user, "id", 7);
        when(userRepository.findById(7)).thenReturn(Optional.of(user));

        assertThat(service.getUser(7)).satisfies(u -> {
            assertThat(u.id()).isEqualTo(7);
            assertThat(u.username()).isEqualTo("alice");
            assertThat(u.email()).isEqualTo("alice@example.com");
        });
    }

    // A session can outlive its account (user deleted while logged in); /me must say 404, not crash.
    @Test
    void getUserMissingIsNotFound() {
        when(userRepository.findById(99)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getUser(99))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("User not found");
    }
}
