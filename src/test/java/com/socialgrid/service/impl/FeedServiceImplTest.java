package com.socialgrid.service.impl;

import com.socialgrid.dto.PostPage;
import com.socialgrid.dto.PostView;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.repository.PostRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// Spec 4.2 and 4.3: limit defaults to 20 and clamps to 1-50, the service asks for limit + 1 rows, and nextCursor
// is the last ID actually returned, or null on the last page.
@ExtendWith(MockitoExtension.class)
class FeedServiceImplTest {

    private static final int VIEWER = 1;

    // What findUserPostsByUsername returns for a user who exists but has no posts on this page (User LEFT JOIN Post).
    private static final PostView USER_WITHOUT_POSTS = new PostView(null, null, "bob", null, null, null, null, 0, 0, false);

    @Mock
    private PostRepository postRepository;
    @InjectMocks
    private FeedServiceImpl service;

    private static List<PostView> rows(Integer... ids) {
        return Arrays.stream(ids)
                .map(id -> new PostView(id, 2, "bob", "/api/posts/" + id + "/image", null, 100, 50, 0, 0, false))
                .toList();
    }

    private static List<Integer> ids(PostPage page) {
        return page.items().stream().map(PostView::postId).toList();
    }

    private void homeRowsAre(List<PostView> rows) {
        when(postRepository.findHomeFeed(anyInt(), anyInt(), any(Pageable.class))).thenReturn(rows);
    }

    private void userRowsAre(List<PostView> rows) {
        when(postRepository.findUserPostsByUsername(anyInt(), anyString(), anyInt(), any(Pageable.class)))
                .thenReturn(rows);
    }

    @ParameterizedTest(name = "limit {0} asks the database for {1} rows")
    @CsvSource(nullValues = "null", value = {
            "null, 21",
            "-5, 2",
            "0, 2",
            "1, 2",
            "20, 21",
            "50, 51",
            "51, 51",
            "1000, 51",
            "2147483647, 51"})
    void homeLimitIsDefaultedAndClampedAndFetchesOneExtra(Integer limit, int expectedRows) {
        homeRowsAre(List.of());

        service.getHomeFeed(VIEWER, null, limit);

        ArgumentCaptor<Pageable> page = ArgumentCaptor.forClass(Pageable.class);
        verify(postRepository).findHomeFeed(eq(VIEWER), anyInt(), page.capture());
        assertThat(page.getValue().getPageNumber()).isZero();
        assertThat(page.getValue().getPageSize()).isEqualTo(expectedRows);
    }

    @ParameterizedTest(name = "limit {0} asks the database for {1} rows")
    @CsvSource(nullValues = "null", value = {"null, 21", "0, 2", "51, 51"})
    void exploreLimitIsDefaultedAndClamped(Integer limit, int expectedRows) {
        when(postRepository.findExploreFeed(anyInt(), anyInt(), any(Pageable.class))).thenReturn(List.of());

        service.getExploreFeed(VIEWER, null, limit);

        ArgumentCaptor<Pageable> page = ArgumentCaptor.forClass(Pageable.class);
        verify(postRepository).findExploreFeed(eq(VIEWER), anyInt(), page.capture());
        assertThat(page.getValue().getPageSize()).isEqualTo(expectedRows);
    }

    @ParameterizedTest(name = "limit {0} asks the database for {1} rows")
    @CsvSource(nullValues = "null", value = {"null, 21", "0, 2", "51, 51"})
    void userPostsLimitIsDefaultedAndClamped(Integer limit, int expectedRows) {
        userRowsAre(List.of(USER_WITHOUT_POSTS));

        service.getUserPosts(VIEWER, "bob", null, limit);

        ArgumentCaptor<Pageable> page = ArgumentCaptor.forClass(Pageable.class);
        verify(postRepository).findUserPostsByUsername(eq(VIEWER), eq("bob"), anyInt(), page.capture());
        assertThat(page.getValue().getPageNumber()).isZero();
        assertThat(page.getValue().getPageSize()).isEqualTo(expectedRows);
    }

    @Test
    void missingBeforeBecomesMaxValueOnEveryFeed() {
        homeRowsAre(List.of());
        when(postRepository.findExploreFeed(anyInt(), anyInt(), any(Pageable.class))).thenReturn(List.of());
        userRowsAre(List.of(USER_WITHOUT_POSTS));

        service.getHomeFeed(VIEWER, null, null);
        service.getExploreFeed(VIEWER, null, null);
        service.getUserPosts(VIEWER, "bob", null, null);

        verify(postRepository).findHomeFeed(eq(VIEWER), eq(Integer.MAX_VALUE), any(Pageable.class));
        verify(postRepository).findExploreFeed(eq(VIEWER), eq(Integer.MAX_VALUE), any(Pageable.class));
        verify(postRepository).findUserPostsByUsername(eq(VIEWER), eq("bob"), eq(Integer.MAX_VALUE),
                any(Pageable.class));
    }

    @Test
    void givenBeforeIsPassedThrough() {
        homeRowsAre(List.of());

        service.getHomeFeed(VIEWER, 77, 10);

        verify(postRepository).findHomeFeed(eq(VIEWER), eq(77), any(Pageable.class));
    }

    @Test
    void emptyResultHasNoCursor() {
        homeRowsAre(List.of());

        PostPage page = service.getHomeFeed(VIEWER, null, 2);

        assertThat(page.items()).isEmpty();
        assertThat(page.nextCursor()).isNull();
    }

    @Test
    void partialPageIsTheLastPage() {
        homeRowsAre(rows(9));

        PostPage page = service.getHomeFeed(VIEWER, null, 2);

        assertThat(ids(page)).containsExactly(9);
        assertThat(page.nextCursor()).isNull();
    }

    // Exactly limit rows came back and limit + 1 were asked for, so nothing is left.
    @Test
    void exactPageIsTheLastPage() {
        homeRowsAre(rows(9, 8));

        PostPage page = service.getHomeFeed(VIEWER, null, 2);

        assertThat(ids(page)).containsExactly(9, 8);
        assertThat(page.nextCursor()).isNull();
    }

    @Test
    void extraRowIsDroppedAndCursorIsLastReturnedId() {
        homeRowsAre(rows(9, 8, 7));

        PostPage page = service.getHomeFeed(VIEWER, null, 2);

        assertThat(ids(page)).containsExactly(9, 8);
        assertThat(page.nextCursor()).isEqualTo(8);
    }

    @Test
    void exploreBuildsCursorTheSameWay() {
        when(postRepository.findExploreFeed(anyInt(), anyInt(), any(Pageable.class))).thenReturn(rows(9, 8));

        PostPage page = service.getExploreFeed(VIEWER, null, 1);

        assertThat(ids(page)).containsExactly(9);
        assertThat(page.nextCursor()).isEqualTo(9);
    }

    @Test
    void userPostsBuildsCursorTheSameWay() {
        userRowsAre(rows(9, 8));

        PostPage page = service.getUserPosts(VIEWER, "bob", 50, 1);

        assertThat(ids(page)).containsExactly(9);
        assertThat(page.nextCursor()).isEqualTo(9);
        verify(postRepository).findUserPostsByUsername(eq(VIEWER), eq("bob"), eq(50), any(Pageable.class));
    }

    @Test
    void userPostsExactPageIsTheLastPage() {
        userRowsAre(rows(9, 8));

        PostPage page = service.getUserPosts(VIEWER, "bob", null, 2);

        assertThat(ids(page)).containsExactly(9, 8);
        assertThat(page.nextCursor()).isNull();
    }

    // No rows at all means the username doesn't exist.
    @Test
    void userPostsForUnknownUserIs404() {
        userRowsAre(List.of());

        assertThatThrownBy(() -> service.getUserPosts(VIEWER, "ghost", null, null))
                .isInstanceOf(NotFoundException.class);
    }

    // One row with no post: the user exists but has nothing on this page, which is an empty page, not a 404.
    @Test
    void userWithoutPostsGetsAnEmptyPage() {
        userRowsAre(List.of(USER_WITHOUT_POSTS));

        PostPage page = service.getUserPosts(VIEWER, "bob", null, null);

        assertThat(page.items()).isEmpty();
        assertThat(page.nextCursor()).isNull();
    }
}
