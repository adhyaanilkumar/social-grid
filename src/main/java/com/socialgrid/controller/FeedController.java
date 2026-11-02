package com.socialgrid.controller;

import com.socialgrid.config.SecurityUser;
import com.socialgrid.dto.PostPage;
import com.socialgrid.service.FeedService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/feed")
public class FeedController {

    private final FeedService feedService;

    public FeedController(FeedService feedService) {
        this.feedService = feedService;
    }

    @GetMapping("/home")
    public PostPage home(@AuthenticationPrincipal SecurityUser me,
                         @RequestParam(required = false) Integer before,
                         @RequestParam(required = false) Integer limit) {
        return feedService.getHomeFeed(me.getId(), before, limit);
    }

    @GetMapping("/explore")
    public PostPage explore(@AuthenticationPrincipal SecurityUser me,
                            @RequestParam(required = false) Integer before,
                            @RequestParam(required = false) Integer limit) {
        return feedService.getExploreFeed(me.getId(), before, limit);
    }
}
