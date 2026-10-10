package com.socialgrid.service;

import com.socialgrid.dto.EmailUpdateRequest;
import com.socialgrid.dto.ProfileResponse;
import com.socialgrid.dto.ProfileUpdateRequest;
import com.socialgrid.dto.RegisterRequest;
import com.socialgrid.dto.UserResponse;

public interface UserService {

    // Credentials are already checked by Spring Security by the time this runs.
    UserResponse login(Integer userId);

    UserResponse register(RegisterRequest request);

    ProfileResponse updateProfile(Integer userId, ProfileUpdateRequest request);

    UserResponse updateEmail(Integer userId, EmailUpdateRequest request);

    ProfileResponse getProfile(String username);
}
