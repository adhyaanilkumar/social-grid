package com.socialgrid.service.impl;

import com.socialgrid.dto.EmailUpdateRequest;
import com.socialgrid.dto.RegisterRequest;
import com.socialgrid.entity.User;
import com.socialgrid.exception.ConflictException;
import com.socialgrid.repository.ProfileRepository;
import com.socialgrid.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
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
}
