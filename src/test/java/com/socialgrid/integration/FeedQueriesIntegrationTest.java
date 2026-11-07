package com.socialgrid.integration;

import com.socialgrid.dto.PostPage;
import com.socialgrid.dto.PostView;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.service.FeedService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.Function;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// FR3, FR4, FR6, FR8 and spec 4.3's note that the feed query's order and filtering must be confirmed by a test.
class FeedQueriesIntegrationTest extends PostgresIntegrationTest {

    @Autowired
    private FeedService feedService;

    private static List<Integer> ids(PostPage page) {
        return page.items().stream().map(PostView::postId).toList();
    }

    private List<Integer> makePosts(Integer author, int count) {
        return new ArrayList<>(IntStream.range(0, count).mapToObj(i -> post(author)).toList());
    }

    private static List<Integer> newestFirst(List<Integer> ids) {
        return ids.stream().sorted(Comparator.reverseOrder()).toList();
    }

    // Follows nextCursor until it runs out, and returns every ID in the order served.
    private static List<Integer> readAllPages(Function<Integer, PostPage> fetchBefore, int maxPageSize) {
        List<Integer> served = new ArrayList<>();
        Integer cursor = null;
        do {
            PostPage page = fetchBefore.apply(cursor);
            assertThat(page.items().size()).isLessThanOrEqualTo(maxPageSize);
            served.addAll(ids(page));
            cursor = page.nextCursor();
        } while (cursor != null);
        return served;
    }

    // ---- Home ----

    @Test
    void homeShowsOwnAndFollowedPostsNewestFirstAndNobodyElse() {
        Integer alice = user("alice");
        Integer bob = user("bob");
        Integer carol = user("carol");
        followService.follow(alice, bob);
        Integer first = post(alice);
        Integer second = post(bob);
        post(carol);
        Integer fourth = post(alice);
        Integer fifth = post(bob);
        post(carol);

        assertThat(ids(feedService.getHomeFeed(alice, null, null))).containsExactly(fifth, fourth, second, first);
    }

    @Test
    void followingIsOneWay() {
        Integer alice = user("alice");
        Integer bob = user("bob");
        followService.follow(alice, bob);
        post(alice);

        assertThat(feedService.getHomeFeed(bob, null, null).items()).isEmpty();
    }

    @Test
    void followingOrUnfollowingChangesHomeStraightAway() {
        Integer alice = user("alice");
        Integer bob = user("bob");
        Integer bobsPost = post(bob);

        assertThat(ids(feedService.getHomeFeed(alice, null, null))).isEmpty();
        followService.follow(alice, bob);
        assertThat(ids(feedService.getHomeFeed(alice, null, null))).containsExactly(bobsPost);
        followService.unfollow(alice, bob);
        assertThat(ids(feedService.getHomeFeed(alice, null, null))).isEmpty();
    }

    @Test
    void newUserHasEmptyHomeWithNoCursor() {
        Integer alice = user("alice");
        post(user("bob"));

        PostPage page = feedService.getHomeFeed(alice, null, null);

        assertThat(page.items()).isEmpty();
        assertThat(page.nextCursor()).isNull();
    }

    // ---- Explore ----

    @Test
    void exploreShowsEveryoneIncludingOwnNewestFirst() {
        Integer alice = user("alice");
        Integer bob = user("bob");
        Integer carol = user("carol");
        Integer first = post(bob);
        Integer second = post(alice);
        Integer third = post(carol);

        assertThat(ids(feedService.getExploreFeed(alice, null, null))).containsExactly(third, second, first);
    }

    // ---- A user's posts ----

    @Test
    void userPostsAreOnlyThatUsersNewestFirst() {
        Integer alice = user("alice");
        Integer bob = user("bob");
        Integer first = post(bob);
        post(alice);
        Integer third = post(bob);

        assertThat(ids(feedService.getUserPosts(alice, "bob", null, null))).containsExactly(third, first);
    }

    @Test
    void userPostsForUnknownUserIs404() {
        Integer alice = user("alice");

        assertThatThrownBy(() -> feedService.getUserPosts(alice, "ghost", null, null))
                .isInstanceOf(NotFoundException.class);
    }

    // ---- Keyset paging ----

    @Test
    void explorePagingHasNoDuplicatesOrGaps() {
        Integer alice = user("alice");
        List<Integer> all = makePosts(alice, 25);

        List<Integer> served = readAllPages(cursor -> feedService.getExploreFeed(alice, cursor, 10), 10);

        assertThat(served).containsExactlyElementsOf(newestFirst(all));
    }

    @Test
    void homePagingHasNoDuplicatesOrGaps() {
        Integer alice = user("alice");
        Integer bob = user("bob");
        Integer carol = user("carol");
        followService.follow(alice, bob);
        List<Integer> visible = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            visible.add(post(alice));
            visible.add(post(bob));
            post(carol);
        }

        List<Integer> served = readAllPages(cursor -> feedService.getHomeFeed(alice, cursor, 7), 7);

        assertThat(served).containsExactlyElementsOf(newestFirst(visible));
    }

    @Test
    void userPostsPagingHasNoDuplicatesOrGaps() {
        Integer alice = user("alice");
        Integer bob = user("bob");
        List<Integer> bobs = new ArrayList<>();
        for (int i = 0; i < 11; i++) {
            bobs.add(post(bob));
            post(alice);
        }

        List<Integer> served = readAllPages(cursor -> feedService.getUserPosts(alice, "bob", cursor, 4), 4);

        assertThat(served).containsExactlyElementsOf(newestFirst(bobs));
    }

    // 20 posts at 10 a page: the second page is full but is the last one, so it must not offer an empty third.
    @Test
    void anExactMultipleOfTheLimitEndsWithoutAnEmptyPage() {
        Integer alice = user("alice");
        List<Integer> all = makePosts(alice, 20);
        List<Integer> expected = newestFirst(all);

        PostPage first = feedService.getExploreFeed(alice, null, 10);
        assertThat(ids(first)).containsExactlyElementsOf(expected.subList(0, 10));
        assertThat(first.nextCursor()).isEqualTo(expected.get(9));

        PostPage second = feedService.getExploreFeed(alice, first.nextCursor(), 10);
        assertThat(ids(second)).containsExactlyElementsOf(expected.subList(10, 20));
        assertThat(second.nextCursor()).isNull();
    }

    // The reason for keyset paging (spec 4.2): a new post mustn't shift what the next page returns.
    @Test
    void aNewPostBetweenPagesCausesNoDuplicates() {
        Integer alice = user("alice");
        List<Integer> all = makePosts(alice, 6);
        List<Integer> expected = newestFirst(all);

        PostPage first = feedService.getExploreFeed(alice, null, 3);
        post(alice);
        PostPage second = feedService.getExploreFeed(alice, first.nextCursor(), 3);

        assertThat(ids(first)).containsExactlyElementsOf(expected.subList(0, 3));
        assertThat(ids(second)).containsExactlyElementsOf(expected.subList(3, 6));
    }

    @Test
    void defaultLimitIs20AndMaximumIs50() {
        Integer alice = user("alice");
        makePosts(alice, 55);

        assertThat(feedService.getExploreFeed(alice, null, null).items()).hasSize(20);
        assertThat(feedService.getExploreFeed(alice, null, 1000).items()).hasSize(50);
        assertThat(feedService.getExploreFeed(alice, null, 0).items()).hasSize(1);
    }

    // ---- What a row contains ----

    @Test
    void rowCarriesAuthorPhotoAndCaption() {
        Integer alice = user("alice");
        Integer postId = post(alice, "hello");

        PostView view = feedService.getExploreFeed(alice, null, null).items().getFirst();

        assertThat(view.postId()).isEqualTo(postId);
        assertThat(view.authorId()).isEqualTo(alice);
        assertThat(view.authorUsername()).isEqualTo("alice");
        assertThat(view.mediaUrl()).isEqualTo("/api/posts/" + postId + "/image");
        assertThat(view.caption()).isEqualTo("hello");
        assertThat(view.width()).isEqualTo(640);
        assertThat(view.height()).isEqualTo(480);
    }

    // 2 likes and 3 comments, so a join that multiplied rows would show 6 of each.
    @Test
    void countsAreCorrectAndLikedByMeDependsOnTheViewer() {
        Integer alice = user("alice");
        Integer bob = user("bob");
        Integer carol = user("carol");
        Integer liked = post(carol);
        Integer untouched = post(carol);
        likeService.createLike(alice, liked);
        likeService.createLike(bob, liked);
        comment(alice, liked, "one");
        comment(bob, liked, "two");
        comment(carol, liked, "three");

        for (Integer viewer : List.of(alice, bob)) {
            PostView view = viewOf(viewer, liked);
            assertThat(view.likeCount()).isEqualTo(2);
            assertThat(view.commentCount()).isEqualTo(3);
            assertThat(view.likedByMe()).isTrue();
        }

        PostView carolsView = viewOf(carol, liked);
        assertThat(carolsView.likeCount()).isEqualTo(2);
        assertThat(carolsView.commentCount()).isEqualTo(3);
        assertThat(carolsView.likedByMe()).isFalse();

        PostView other = viewOf(alice, untouched);
        assertThat(other.likeCount()).isZero();
        assertThat(other.commentCount()).isZero();
        assertThat(other.likedByMe()).isFalse();
    }

    @Test
    void homeAndUserPostsAlsoCarryCountsPerViewer() {
        Integer alice = user("alice");
        Integer bob = user("bob");
        followService.follow(alice, bob);
        Integer postId = post(bob);
        likeService.createLike(alice, postId);
        comment(alice, postId, "hi");

        PostView home = feedService.getHomeFeed(alice, null, null).items().getFirst();
        assertThat(home.likeCount()).isEqualTo(1);
        assertThat(home.commentCount()).isEqualTo(1);
        assertThat(home.likedByMe()).isTrue();

        PostView grid = feedService.getUserPosts(bob, "bob", null, null).items().getFirst();
        assertThat(grid.likeCount()).isEqualTo(1);
        assertThat(grid.commentCount()).isEqualTo(1);
        assertThat(grid.likedByMe()).isFalse();
    }

    private PostView viewOf(Integer viewer, Integer postId) {
        return feedService.getExploreFeed(viewer, null, null).items().stream()
                .filter(view -> view.postId().equals(postId))
                .findFirst()
                .orElseThrow();
    }
}
