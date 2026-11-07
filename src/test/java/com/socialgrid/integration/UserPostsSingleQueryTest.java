package com.socialgrid.integration;

import com.socialgrid.dto.PostPage;
import com.socialgrid.dto.PostView;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.service.FeedService;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// BUG-10, NFR3 (decided 2026-11-07): a user's posts page is one SQL statement, user lookup included.
// An unknown user is still 404, and a known user with no posts is an empty page.
@TestPropertySource(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
class UserPostsSingleQueryTest extends PostgresIntegrationTest {

    private static final int PAGE_SIZE = 20;

    @Autowired
    private FeedService feedService;
    @Autowired
    private EntityManagerFactory entityManagerFactory;

    private Statistics statistics;
    private Integer viewer;
    private final List<Integer> authorPosts = new ArrayList<>();

    @BeforeEach
    void manyPostsAndAnEmptyUser() {
        statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        authorPosts.clear();
        viewer = user("viewer");
        Integer author = user("author");
        user("quiet");
        for (int i = 0; i < PAGE_SIZE + 5; i++) {
            Integer postId = post(author);
            authorPosts.add(postId);
            likeService.createLike(viewer, postId);
            comment(viewer, postId, "hello");
        }
        statistics.clear();
    }

    @Test
    void userWithManyPostsIsOneStatement() {
        PostPage page = feedService.getUserPosts(viewer, "author", null, PAGE_SIZE);

        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
        assertThat(page.items()).hasSize(PAGE_SIZE);
        PostView newest = page.items().getFirst();
        assertThat(newest.postId()).isEqualTo(authorPosts.getLast());
        assertThat(newest.authorUsername()).isEqualTo("author");
        assertThat(newest.likeCount()).isEqualTo(1);
        assertThat(newest.commentCount()).isEqualTo(1);
        assertThat(newest.likedByMe()).isTrue();
        assertThat(page.nextCursor()).isEqualTo(page.items().getLast().postId());
    }

    @Test
    void userWithNoPostsIsOneStatementAndAnEmptyPage() {
        PostPage page = feedService.getUserPosts(viewer, "quiet", null, PAGE_SIZE);

        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
        assertThat(page.items()).isEmpty();
        assertThat(page.nextCursor()).isNull();
    }

    @Test
    void laterPageIsOneStatement() {
        PostPage first = feedService.getUserPosts(viewer, "author", null, PAGE_SIZE);
        statistics.clear();

        PostPage second = feedService.getUserPosts(viewer, "author", first.nextCursor(), PAGE_SIZE);

        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
        assertThat(second.items()).extracting(PostView::postId)
                .containsExactlyElementsOf(authorPosts.subList(0, 5).reversed());
        assertThat(second.nextCursor()).isNull();
    }

    // Past the last post the user still exists, so this is an empty page, not 404.
    @Test
    void pagePastTheOldestPostIsEmptyNot404() {
        PostPage page = feedService.getUserPosts(viewer, "author", authorPosts.getFirst(), PAGE_SIZE);

        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
        assertThat(page.items()).isEmpty();
        assertThat(page.nextCursor()).isNull();
    }

    @Test
    void unknownUserIsStill404() {
        assertThatThrownBy(() -> feedService.getUserPosts(viewer, "ghost", null, PAGE_SIZE))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("User not found");
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
    }
}
