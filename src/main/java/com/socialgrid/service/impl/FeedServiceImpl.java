package com.socialgrid.service.impl;

import com.socialgrid.dto.PostPage;
import com.socialgrid.dto.PostView;
import com.socialgrid.entity.User;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.repository.PostRepository;
import com.socialgrid.repository.UserRepository;
import com.socialgrid.service.FeedService;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

// Paging is "give me posts older than ID X" (keyset paging), not "skip the first 40". With skipping,
// a new post would shift every position and the next page would show a duplicate.
@Service
public class FeedServiceImpl implements FeedService {

    private static final int DEFAULT_LIMIT = 20;
    private static final int MAX_LIMIT = 50;

    private final PostRepository postRepository;
    private final UserRepository userRepository;

    public FeedServiceImpl(PostRepository postRepository, UserRepository userRepository) {
        this.postRepository = postRepository;
        this.userRepository = userRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public PostPage getHomeFeed(Integer viewerId, Integer before, Integer limit) {
        int size = clamp(limit);
        return toPage(postRepository.findHomeFeed(viewerId, cursor(before), oneExtra(size)), size);
    }

    @Override
    @Transactional(readOnly = true)
    public PostPage getExploreFeed(Integer viewerId, Integer before, Integer limit) {
        int size = clamp(limit);
        return toPage(postRepository.findExploreFeed(viewerId, cursor(before), oneExtra(size)), size);
    }

    @Override
    @Transactional(readOnly = true)
    public PostPage getUserPosts(Integer viewerId, String username, Integer before, Integer limit) {
        User author = userRepository.findByUsername(username)
                .orElseThrow(() -> new NotFoundException("User not found"));
        int size = clamp(limit);
        return toPage(postRepository.findUserPosts(viewerId, author.getId(), cursor(before), oneExtra(size)), size);
    }

    private int clamp(Integer limit) {
        return limit == null ? DEFAULT_LIMIT : Math.clamp(limit, 1, MAX_LIMIT);
    }

    // No cursor means "from the newest". A real number avoids a null parameter, which often causes
    // type errors in Postgres.
    private int cursor(Integer before) {
        return before == null ? Integer.MAX_VALUE : before;
    }

    // Asking for one more than the page size is how we learn whether another page exists.
    private Pageable oneExtra(int size) {
        return PageRequest.of(0, size + 1);
    }

    private PostPage toPage(List<PostView> rows, int size) {
        if (rows.size() <= size) {
            return new PostPage(rows, null);
        }
        List<PostView> items = rows.subList(0, size);
        return new PostPage(items, items.getLast().postId());
    }
}
