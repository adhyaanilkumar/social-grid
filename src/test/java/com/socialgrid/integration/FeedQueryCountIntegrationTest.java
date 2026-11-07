package com.socialgrid.integration;

import com.socialgrid.service.FeedService;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

// NFR3: one feed page makes one database query, not one per post. Hibernate counts the SQL statements it prepares.
@TestPropertySource(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
class FeedQueryCountIntegrationTest extends PostgresIntegrationTest {

    private static final int PAGE_SIZE = 20;

    @Autowired
    private FeedService feedService;
    @Autowired
    private EntityManagerFactory entityManagerFactory;

    private Statistics statistics;
    private Integer viewer;

    // Each post has a like and a comment, and there are more posts than fit a page, so an N+1 would show up.
    @BeforeEach
    void manyPostsWithDetails() {
        statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        viewer = user("viewer");
        Integer author = user("author");
        followService.follow(viewer, author);
        for (int i = 0; i < PAGE_SIZE + 5; i++) {
            Integer postId = post(author);
            likeService.createLike(viewer, postId);
            comment(viewer, postId, "hello");
        }
        statistics.clear();
    }

    @Test
    void homePageRunsExactlyOneStatement() {
        assertThat(feedService.getHomeFeed(viewer, null, PAGE_SIZE).items()).hasSize(PAGE_SIZE);

        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
    }

    @Test
    void explorePageRunsExactlyOneStatement() {
        assertThat(feedService.getExploreFeed(viewer, null, PAGE_SIZE).items()).hasSize(PAGE_SIZE);

        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
    }

    // The owner's NFR3 decision: a user's posts page is also exactly one statement, the author lookup included.
    @Test
    void userPageRunsExactlyOneStatement() {
        assertThat(feedService.getUserPosts(viewer, "author", null, PAGE_SIZE).items()).hasSize(PAGE_SIZE);

        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
    }

    @Test
    void userPageWithNoPostsLeftRunsExactlyOneStatement() {
        assertThat(feedService.getUserPosts(viewer, "viewer", null, PAGE_SIZE).items()).isEmpty();

        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
    }
}
