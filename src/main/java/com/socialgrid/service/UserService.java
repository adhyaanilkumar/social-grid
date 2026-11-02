package com.socialgrid.service;

import com.socialgrid.dto.EmailUpdateRequest;
import com.socialgrid.dto.LoginRequest;
import com.socialgrid.dto.ProfileResponse;
import com.socialgrid.dto.ProfileUpdateRequest;
import com.socialgrid.dto.RegisterRequest;
import com.socialgrid.dto.UserResponse;
import com.socialgrid.dto.UserSummary;
import org.springframework.security.core.Authentication;

import java.util.List;

public interface UserService {

    // Checks the username/email and password. Throws BadCredentialsException if either is wrong.
    Authentication authenticate(LoginRequest request);

    UserResponse getUser(Integer userId);

    UserResponse register(RegisterRequest request);

    ProfileResponse updateProfile(Integer userId, ProfileUpdateRequest request);

    UserResponse updateEmail(Integer userId, EmailUpdateRequest request);

    ProfileResponse getProfile(String username, Integer viewerId);

    List<UserSummary> searchUsers(String query, Integer viewerId);
}
