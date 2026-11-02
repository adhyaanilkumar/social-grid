package com.socialgrid.controller;

import com.socialgrid.config.SecurityUser;
import com.socialgrid.dto.EmailUpdateRequest;
import com.socialgrid.dto.FollowResponse;
import com.socialgrid.dto.PostPage;
import com.socialgrid.dto.ProfileResponse;
import com.socialgrid.dto.ProfileUpdateRequest;
import com.socialgrid.dto.UserResponse;
import com.socialgrid.dto.UserSummary;
import com.socialgrid.entity.Follows;
import com.socialgrid.service.FeedService;
import com.socialgrid.service.FollowService;
import com.socialgrid.service.UserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;
    private final FollowService followService;
    private final FeedService feedService;

    public UserController(UserService userService, FollowService followService, FeedService feedService) {
        this.userService = userService;
        this.followService = followService;
        this.feedService = feedService;
    }

    @GetMapping("/search")
    public List<UserSummary> search(@AuthenticationPrincipal SecurityUser me,
                                    @RequestParam(required = false) String q) {
        return userService.searchUsers(q, me.getId());
    }

    @GetMapping("/{username}/profile")
    public ProfileResponse getProfile(@AuthenticationPrincipal SecurityUser me, @PathVariable String username) {
        return userService.getProfile(username, me.getId());
    }

    @GetMapping("/{username}/posts")
    public PostPage getPosts(@AuthenticationPrincipal SecurityUser me, @PathVariable String username,
                             @RequestParam(required = false) Integer before,
                             @RequestParam(required = false) Integer limit) {
        return feedService.getUserPosts(me.getId(), username, before, limit);
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

    @DeleteMapping("/{userId}/follow")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unfollow(@AuthenticationPrincipal SecurityUser me, @PathVariable Integer userId) {
        followService.unfollow(me.getId(), userId);
    }
}
