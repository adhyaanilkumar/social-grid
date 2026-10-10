package com.socialgrid.controller;

import com.socialgrid.config.SecurityUser;
import com.socialgrid.dto.EmailUpdateRequest;
import com.socialgrid.dto.FollowResponse;
import com.socialgrid.dto.ProfileResponse;
import com.socialgrid.dto.ProfileUpdateRequest;
import com.socialgrid.dto.UserResponse;
import com.socialgrid.entity.Follows;
import com.socialgrid.service.FollowService;
import com.socialgrid.service.UserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;
    private final FollowService followService;

    public UserController(UserService userService, FollowService followService) {
        this.userService = userService;
        this.followService = followService;
    }

    @GetMapping("/{username}/profile")
    public ProfileResponse getProfile(@PathVariable String username) {
        return userService.getProfile(username);
    }

    @PutMapping("/me/profile")
    public ProfileResponse updateProfile(@AuthenticationPrincipal SecurityUser me,
                                         @Valid @RequestBody ProfileUpdateRequest request) {
        return userService.updateProfile(me.getId(), request);
    }

    @PutMapping("/me/email")
    public UserResponse updateEmail(@AuthenticationPrincipal SecurityUser me,
                                    @Valid @RequestBody EmailUpdateRequest request) {
        return userService.updateEmail(me.getId(), request);
    }

    @PostMapping("/{userId}/follow")
    @ResponseStatus(HttpStatus.CREATED)
    public FollowResponse follow(@AuthenticationPrincipal SecurityUser me, @PathVariable Integer userId) {
        Follows follows = followService.follow(me.getId(), userId);
        return new FollowResponse(follows.getId().getFollowerId(), follows.getId().getFolloweeId());
    }
}
