package com.socialgrid.config;

import com.socialgrid.repository.UserRepository;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

// Spring Security calls this with what the user typed in the login form, then compares password hashes itself.
// The login field accepts a username or an email, so we try the username first, then the email.
@Service
public class SecurityUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    public SecurityUserDetailsService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    // Postgres can't store or compare text containing a NUL character (0x00): the query fails, and that error
    // would reach the client as a 409 instead of a failed login. No stored username or email can contain one,
    // so such an identifier is simply an unknown account, answered without asking the database.
    private static final char NUL = '\u0000';

    @Override
    public UserDetails loadUserByUsername(String identifier) {
        if (identifier.indexOf(NUL) >= 0) {
            throw new UsernameNotFoundException("User not found");
        }
        return userRepository.findByUsername(identifier)
                .or(() -> userRepository.findByEmail(identifier))
                .map(SecurityUser::new)
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));
    }
}
