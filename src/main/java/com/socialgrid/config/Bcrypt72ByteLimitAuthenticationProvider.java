package com.socialgrid.config;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;

import java.nio.charset.StandardCharsets;

// BCrypt only reads the first 72 bytes of a password, so a correct 72-byte password with anything appended
// would also match its hash. No stored password can be longer than 72 bytes, so a longer one is always wrong:
// reject it with the same BadCredentialsException (and so the same 401 body) as any wrong password.
public class Bcrypt72ByteLimitAuthenticationProvider extends DaoAuthenticationProvider {

    static final int BCRYPT_MAX_BYTES = 72;

    public Bcrypt72ByteLimitAuthenticationProvider(UserDetailsService userDetailsService) {
        super(userDetailsService);
    }

    @Override
    protected void additionalAuthenticationChecks(UserDetails userDetails,
                                                  UsernamePasswordAuthenticationToken authentication)
            throws AuthenticationException {
        // The BCrypt comparison runs first, every time, so an over-long password takes as long to reject as
        // any other wrong password (and as an unknown account) and timing reveals nothing.
        super.additionalAuthenticationChecks(userDetails, authentication);
        String presented = authentication.getCredentials().toString();
        if (presented.getBytes(StandardCharsets.UTF_8).length > BCRYPT_MAX_BYTES) {
            throw new BadCredentialsException(this.messages.getMessage(
                    "AbstractUserDetailsAuthenticationProvider.badCredentials", "Bad credentials"));
        }
    }
}
