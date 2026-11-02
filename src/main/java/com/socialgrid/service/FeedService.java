package com.socialgrid.service;

import com.socialgrid.dto.PostPage;

public interface FeedService {

    PostPage getHomeFeed(Integer viewerId, Integer before, Integer limit);

    PostPage getExploreFeed(Integer viewerId, Integer before, Integer limit);

    PostPage getUserPosts(Integer viewerId, String username, Integer before, Integer limit);
}
