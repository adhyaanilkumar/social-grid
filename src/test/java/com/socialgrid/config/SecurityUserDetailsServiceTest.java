package com.socialgrid.config;

import com.socialgrid.entity.User;
import com.socialgrid.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SecurityUserDetailsServiceTest {

    @Mock
    private UserRepository userRepository;
    @InjectMocks
    private SecurityUserDetailsService service;

    private static User user(int id, String username, String password, String email) {
        User user = new User(username, password, email);
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }

    @Test
    void findsByUsername() {
        when(userRepository.findByUsername("alice"))
                .thenReturn(Optional.of(user(7, "alice", "hash", "alice@example.com")));

        UserDetails found = service.loadUserByUsername("alice");

        assertThat(found).isInstanceOf(SecurityUser.class);
        assertThat(((SecurityUser) found).getId()).isEqualTo(7);
        assertThat(found.getUsername()).isEqualTo("alice");
        assertThat(found.getPassword()).isEqualTo("hash");
        verify(userRepository, never()).findByEmail(anyString());
    }

    @Test
    void fallsBackToEmail() {
        when(userRepository.findByUsername("alice@example.com")).thenReturn(Optional.empty());
        when(userRepository.findByEmail("alice@example.com"))
                .thenReturn(Optional.of(user(7, "alice", "hash", "alice@example.com")));

        // The principal is always the real username, whichever field was typed.
        assertThat(service.loadUserByUsername("alice@example.com").getUsername()).isEqualTo("alice");
    }

    @Test
    void neitherMatchIsUsernameNotFound() {
        when(userRepository.findByUsername("ghost")).thenReturn(Optional.empty());
        when(userRepository.findByEmail("ghost")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.loadUserByUsername("ghost"))
                .isInstanceOf(UsernameNotFoundException.class);
    }

    // Usernames may not contain '@' today, but if one user's username equals another's email, the
    // username owner wins and the email lookup never runs.
    @Test
    void usernameWinsOverEmail() {
        when(userRepository.findByUsername("x@example.com"))
                .thenReturn(Optional.of(user(1, "x@example.com", "hash1", "one@example.com")));
        lenient().when(userRepository.findByEmail("x@example.com"))
                .thenReturn(Optional.of(user(2, "two", "hash2", "x@example.com")));

        assertThat(((SecurityUser) service.loadUserByUsername("x@example.com")).getId()).isEqualTo(1);
        verify(userRepository, never()).findByEmail(anyString());
    }

    // ---- Through SecurityConfig's real AuthenticationManager (BCrypt), with only the repository mocked ----

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);

    private AuthenticationManager manager() {
        return new SecurityConfig().authenticationManager(service, encoder);
    }

    private static Authentication attempt(String identifier, String password) {
        return UsernamePasswordAuthenticationToken.unauthenticated(identifier, password);
    }

    @Test
    void correctPasswordByEmailAuthenticates() {
        when(userRepository.findByUsername("alice@example.com")).thenReturn(Optional.empty());
        when(userRepository.findByEmail("alice@example.com"))
                .thenReturn(Optional.of(user(7, "alice", encoder.encode("password1"), "alice@example.com")));

        Authentication result = manager().authenticate(attempt("alice@example.com", "password1"));

        assertThat(result.isAuthenticated()).isTrue();
        assertThat(((SecurityUser) result.getPrincipal()).getId()).isEqualTo(7);
        // The raw password is wiped from the result once checked.
        assertThat(result.getCredentials()).isNull();
    }

    @Test
    void wrongPasswordIsBadCredentials() {
        when(userRepository.findByUsername("alice"))
                .thenReturn(Optional.of(user(7, "alice", encoder.encode("password1"), "alice@example.com")));

        assertThatThrownBy(() -> manager().authenticate(attempt("alice", "wrong")))
                .isInstanceOf(BadCredentialsException.class);
    }

    // An unknown account must surface as the same BadCredentialsException as a wrong password, otherwise
    // GlobalExceptionHandler wouldn't map it to the shared 401 message and the response would leak which
    // accounts exist.
    @Test
    void unknownUserIsAlsoBadCredentials() {
        when(userRepository.findByUsername("ghost")).thenReturn(Optional.empty());
        when(userRepository.findByEmail("ghost")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> manager().authenticate(attempt("ghost", "password1")))
                .isExactlyInstanceOf(BadCredentialsException.class);
    }
}
