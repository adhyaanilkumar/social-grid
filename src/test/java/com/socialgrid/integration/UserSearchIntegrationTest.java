package com.socialgrid.integration;

import com.socialgrid.dto.UserSummary;
import com.socialgrid.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

// FR5. Spec 4.3 says Spring Data "should" escape % and _ and asks for a test to check it, not rely on it.
class UserSearchIntegrationTest extends PostgresIntegrationTest {

    @Autowired
    private UserService userService;

    private List<String> search(String query, Integer viewer) {
        return userService.searchUsers(query, viewer).stream().map(UserSummary::username).toList();
    }

    @Test
    void matchingIgnoresCase() {
        Integer viewer = user("viewer");
        user("BobSmith");

        assertThat(search("bobsmith", viewer)).containsExactly("BobSmith");
        assertThat(search("BOBSMITH", viewer)).containsExactly("BobSmith");
    }

    @Test
    void matchingFindsAnyPartOfTheName() {
        Integer viewer = user("viewer");
        user("robert");
        user("carol");

        assertThat(search("rob", viewer)).containsExactly("robert");
        assertThat(search("ber", viewer)).containsExactly("robert");
        assertThat(search("ert", viewer)).containsExactly("robert");
    }

    @Test
    void theSearcherIsExcluded() {
        Integer alice = user("alice");
        user("alice2");

        assertThat(search("alice", alice)).containsExactly("alice2");
    }

    @Test
    void resultsAreSortedByUsername() {
        Integer viewer = user("viewer");
        user("test_c");
        user("test_a");
        user("test_b");

        assertThat(search("test", viewer)).containsExactly("test_a", "test_b", "test_c");
    }

    @Test
    void atMost20ResultsAreTheFirstByName() {
        Integer viewer = user("viewer");
        IntStream.rangeClosed(1, 25).forEach(i -> user(String.format("member%02d", i)));

        List<String> expected = IntStream.rangeClosed(1, 20).mapToObj(i -> String.format("member%02d", i)).toList();

        assertThat(search("member", viewer)).containsExactlyElementsOf(expected);
    }

    @Test
    void percentMatchesLiterally() {
        Integer viewer = user("viewer");
        user("a%c");
        user("abc");

        assertThat(search("%", viewer)).contains("a%c");
        assertThat(search("a%c", viewer)).containsExactly("a%c");
    }

    @Test
    void underscoreMatchesLiterally() {
        Integer viewer = user("viewer");
        user("a_c");
        user("abc");

        assertThat(search("a_c", viewer)).containsExactly("a_c");
    }

    // Backslash is the escape character Spring Data uses for % and _, so it needs escaping too.
    @Test
    void backslashMatchesLiterally() {
        Integer viewer = user("viewer");
        user("a\\c");
        user("abc");

        assertThat(search("\\", viewer)).containsExactly("a\\c");
    }

    @Test
    void surroundingSpacesAreIgnored() {
        Integer viewer = user("viewer");
        user("bob");

        assertThat(search("  bob  ", viewer)).containsExactly("bob");
    }

    @Test
    void blankOrMissingQueryFindsNobody() {
        Integer viewer = user("viewer");
        user("bob");

        assertThat(search("", viewer)).isEmpty();
        assertThat(search("   ", viewer)).isEmpty();
        assertThat(search(null, viewer)).isEmpty();
    }
}
