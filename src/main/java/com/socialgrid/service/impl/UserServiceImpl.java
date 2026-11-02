package com.socialgrid.service.impl;

import com.socialgrid.dto.EmailUpdateRequest;
import com.socialgrid.dto.LoginRequest;
import com.socialgrid.dto.ProfileResponse;
import com.socialgrid.dto.ProfileUpdateRequest;
import com.socialgrid.dto.RegisterRequest;
import com.socialgrid.dto.UserResponse;
import com.socialgrid.dto.UserSummary;
import com.socialgrid.entity.FollowId;
import com.socialgrid.entity.Profile;
import com.socialgrid.entity.User;
import com.socialgrid.exception.ConflictException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.repository.FollowsRepository;
import com.socialgrid.repository.PostRepository;
import com.socialgrid.repository.ProfileRepository;
import com.socialgrid.repository.UserRepository;
import com.socialgrid.service.UserService;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final ProfileRepository profileRepository;
    private final PostRepository postRepository;
    private final FollowsRepository followsRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;

    public UserServiceImpl(UserRepository userRepository,
                           ProfileRepository profileRepository,
                           PostRepository postRepository,
                           FollowsRepository followsRepository,
                           PasswordEncoder passwordEncoder,
                           AuthenticationManager authenticationManager) {
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
        this.postRepository = postRepository;
        this.followsRepository = followsRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
    }

    @Override
    public Authentication authenticate(LoginRequest request) {
        return authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(request.identifier(), request.password()));
    }

    @Override
    @Transactional(readOnly = true)
    public UserResponse getUser(Integer userId) {
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
        // Users are the viewer of their own profile here.
        return toResponse(profile, userId);
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
    public ProfileResponse getProfile(String username, Integer viewerId) {
        return profileRepository.findByUserUsername(username)
                .map(profile -> toResponse(profile, viewerId))
                .orElseThrow(() -> new NotFoundException("User not found"));
    }

    @Override
    @Transactional(readOnly = true)
    public List<UserSummary> searchUsers(String query, Integer viewerId) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        return userRepository.findTop20ByUsernameContainingIgnoreCaseAndIdNotOrderByUsernameAsc(query.trim(), viewerId)
                .stream()
                .map(user -> new UserSummary(user.getId(), user.getUsername()))
                .toList();
    }

    private User findUser(Integer userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));
    }

    private UserResponse toResponse(User user) {
        return new UserResponse(user.getId(), user.getUsername(), user.getEmail());
    }

    private ProfileResponse toResponse(Profile profile, Integer viewerId) {
        Integer userId = profile.getUserId();
        return new ProfileResponse(userId, profile.getUsername(), profile.getFirstName(),
                profile.getLastName(), profile.getBio(), profile.getProfilePic(),
                postRepository.countByAuthorId(userId),
                followsRepository.countByIdFolloweeId(userId),
                followsRepository.countByIdFollowerId(userId),
                followsRepository.existsById(new FollowId(viewerId, userId)));
    }
}
