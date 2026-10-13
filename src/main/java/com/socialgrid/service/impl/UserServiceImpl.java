package com.socialgrid.service.impl;

import com.socialgrid.dto.EmailUpdateRequest;
import com.socialgrid.dto.ProfileResponse;
import com.socialgrid.dto.ProfileUpdateRequest;
import com.socialgrid.dto.RegisterRequest;
import com.socialgrid.dto.UserResponse;
import com.socialgrid.entity.Profile;
import com.socialgrid.entity.User;
import com.socialgrid.exception.ConflictException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.repository.ProfileRepository;
import com.socialgrid.repository.UserRepository;
import com.socialgrid.service.UserService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final ProfileRepository profileRepository;
    private final PasswordEncoder passwordEncoder;

    public UserServiceImpl(UserRepository userRepository,
                           ProfileRepository profileRepository,
                           PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional(readOnly = true)
    public UserResponse login(Integer userId) {
        return toResponse(findUser(userId));
    }

    @Override
    @Transactional
    public UserResponse register(RegisterRequest request) {
        if (userRepository.existsByUsername(request.username())) {
            throw new ConflictException("username", "Username already taken");
        }
        if (userRepository.existsByEmail(request.email())) {
            throw new ConflictException("email", "Email already registered");
        }
        User user = userRepository.save(
                new User(request.username(), passwordEncoder.encode(request.password()), request.email()));
        profileRepository.save(new Profile(user));
        return toResponse(user);
    }

    @Override
    @Transactional
    public ProfileResponse updateProfile(Integer userId, ProfileUpdateRequest request) {
        Profile profile = profileRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("Profile not found"));
        if (request.firstName() != null) profile.setFirstname(request.firstName());
        if (request.lastName() != null) profile.setLastname(request.lastName());
        if (request.bio() != null) profile.setBio(request.bio());
        if (request.profilePicUrl() != null) profile.setProfilePic(request.profilePicUrl());
        return toResponse(profile);
    }

    @Override
    @Transactional
    public UserResponse updateEmail(Integer userId, EmailUpdateRequest request) {
        User user = findUser(userId);
        if (!request.email().equals(user.getEmail()) && userRepository.existsByEmail(request.email())) {
            throw new ConflictException("email", "Email already registered");
        }
        user.setEmail(request.email());
        return toResponse(user);
    }

    @Override
    @Transactional(readOnly = true)
    public ProfileResponse getProfile(String username) {
        return profileRepository.findByUserUsername(username)
                .map(this::toResponse)
                .orElseThrow(() -> new NotFoundException("User not found"));
    }

    private User findUser(Integer userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));
    }

    private UserResponse toResponse(User user) {
        return new UserResponse(user.getId(), user.getUsername(), user.getEmail());
    }

    private ProfileResponse toResponse(Profile profile) {
        return new ProfileResponse(profile.getUserId(), profile.getUsername(), profile.getFirstName(),
                profile.getLastName(), profile.getBio(), profile.getProfilePic());
    }
}
