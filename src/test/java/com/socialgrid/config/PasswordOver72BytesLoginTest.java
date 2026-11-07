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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

// BCrypt only reads the first 72 bytes of a password. Login must not accept a real 72-byte password with
// extra characters glued on; it must fail exactly like any other wrong password (BadCredentialsException,
// which GlobalExceptionHandler turns into the shared 401 body).
@ExtendWith(MockitoExtension.class)
class PasswordOver72BytesLoginTest {

    private static final String P72 = "p".repeat(72);
    // "€" is 3 bytes in UTF-8, so 24 of them are exactly 72 bytes (but only 24 characters).
    private static final String EURO72 = "€".repeat(24);

    @Mock
    private UserRepository userRepository;
    @InjectMocks
    private SecurityUserDetailsService service;

    // The real beans from SecurityConfig, as the running app wires them.
    private final SecurityConfig config = new SecurityConfig();
    private final PasswordEncoder encoder = config.passwordEncoder();

    private AuthenticationManager manager() {
        return config.authenticationManager(service, encoder);
    }

    private void storedUser(String rawPassword) {
        User user = new User("alice", encoder.encode(rawPassword), "alice@example.com");
        ReflectionTestUtils.setField(user, "id", 7);
        when(userRepository.findByUsername("alice")).thenReturn(Optional.of(user));
    }

    private Authentication login(String password) {
        return manager().authenticate(UsernamePasswordAuthenticationToken.unauthenticated("alice", password));
    }

    @Test
    void exactly72CharPasswordLogsIn() {
        storedUser(P72);
        assertThat(login(P72).isAuthenticated()).isTrue();
    }

    @Test
    void the72CharPasswordPlusExtraIsBadCredentials() {
        storedUser(P72);
        assertThatThrownBy(() -> login(P72 + "EXTRA")).isExactlyInstanceOf(BadCredentialsException.class);
    }

    @Test
    void the72CharPasswordPlusOneCharIsBadCredentials() {
        storedUser(P72);
        assertThatThrownBy(() -> login(P72 + "p")).isExactlyInstanceOf(BadCredentialsException.class);
    }

    @Test
    void multibytePasswordAt72BytesLogsIn() {
        assertThat(EURO72.getBytes(StandardCharsets.UTF_8)).hasSize(72);
        storedUser(EURO72);
        assertThat(login(EURO72).isAuthenticated()).isTrue();
    }

    @Test
    void multibytePasswordUnder72BytesLogsIn() {
        String pw = "pässwörd€1";
        storedUser(pw);
        assertThat(login(pw).isAuthenticated()).isTrue();
    }

    // Only 25 characters, but 73 bytes: the limit is bytes, not characters.
    @Test
    void multibytePasswordOver72BytesIsBadCredentials() {
        storedUser(EURO72);
        assertThatThrownBy(() -> login(EURO72 + "x")).isExactlyInstanceOf(BadCredentialsException.class);
    }

    // An unknown account with an over-long password must still be a plain BadCredentialsException (not a 500
    // from the encoder), so it can't be told apart from a known account.
    @Test
    void unknownUserWithOverLongPasswordIsBadCredentials() {
        when(userRepository.findByUsername("ghost")).thenReturn(Optional.empty());
        when(userRepository.findByEmail("ghost")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> manager().authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated("ghost", P72 + "EXTRA")))
                .isExactlyInstanceOf(BadCredentialsException.class);
    }
}
