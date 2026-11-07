package com.socialgrid.service.impl;

import com.socialgrid.dto.CommentRequest;
import com.socialgrid.dto.CommentResponse;
import com.socialgrid.entity.Comment;
import com.socialgrid.entity.User;
import com.socialgrid.exception.ForbiddenException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.repository.CommentRepository;
import com.socialgrid.repository.PostRepository;
import com.socialgrid.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CommentServiceImplTest {

    private static final int POST_AUTHOR = 1;
    private static final int COMMENTER = 2;
    private static final int POST_ID = 10;
    private static final int COMMENT_ID = 20;
    private static final CommentRequest REQUEST = new CommentRequest("nice photo");

    @Mock
    private CommentRepository commentRepository;
    @Mock
    private PostRepository postRepository;
    @Mock
    private UserRepository userRepository;
    @InjectMocks
    private CommentServiceImpl service;

    private static Comment commentByCommenter() {
        Comment comment = new Comment(COMMENTER, POST_ID, "original");
        ReflectionTestUtils.setField(comment, "commentId", COMMENT_ID);
        return comment;
    }

    private void commenterIsBob() {
        when(userRepository.findById(COMMENTER)).thenReturn(Optional.of(new User("bob", "hash", "bob@example.com")));
    }

    @Test
    void createIncludesAuthorUsername() {
        when(postRepository.existsById(POST_ID)).thenReturn(true);
        when(commentRepository.save(any(Comment.class))).thenReturn(commentByCommenter());
        commenterIsBob();

        CommentResponse response = service.createComment(COMMENTER, POST_ID, REQUEST);

        assertThat(response.commentId()).isEqualTo(COMMENT_ID);
        assertThat(response.authorId()).isEqualTo(COMMENTER);
        assertThat(response.authorUsername()).isEqualTo("bob");
        assertThat(response.postId()).isEqualTo(POST_ID);
    }

    @Test
    void createOnMissingPostIs404() {
        when(postRepository.existsById(POST_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.createComment(COMMENTER, POST_ID, REQUEST))
                .isInstanceOf(NotFoundException.class);
        verifyNoInteractions(commentRepository);
    }

    @Test
    void readingCommentsOfMissingPostIs404() {
        when(postRepository.existsById(POST_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.getCommentsForPost(POST_ID)).isInstanceOf(NotFoundException.class);
        verifyNoInteractions(commentRepository);
    }

    @Test
    void readingCommentsReturnsTheQueryResult() {
        List<CommentResponse> rows = List.of(new CommentResponse(COMMENT_ID, COMMENTER, "bob", POST_ID, "hi"));
        when(postRepository.existsById(POST_ID)).thenReturn(true);
        when(commentRepository.findResponsesByPostId(POST_ID)).thenReturn(rows);

        assertThat(service.getCommentsForPost(POST_ID)).isEqualTo(rows);
    }

    @Test
    void authorCanDeleteTheirComment() {
        Comment comment = commentByCommenter();
        when(commentRepository.findById(COMMENT_ID)).thenReturn(Optional.of(comment));

        service.deleteComment(COMMENTER, COMMENT_ID);

        verify(commentRepository).delete(comment);
    }

    // FR10: the post's author is just another user as far as someone else's comment goes.
    @Test
    void postAuthorCannotDeleteSomeoneElsesComment() {
        when(commentRepository.findById(COMMENT_ID)).thenReturn(Optional.of(commentByCommenter()));

        assertThatThrownBy(() -> service.deleteComment(POST_AUTHOR, COMMENT_ID))
                .isInstanceOf(ForbiddenException.class);
        verify(commentRepository, never()).delete(any(Comment.class));
    }

    @Test
    void deletingMissingCommentIs404() {
        when(commentRepository.findById(COMMENT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.deleteComment(COMMENTER, COMMENT_ID))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void authorCanEditTheirComment() {
        when(commentRepository.findById(COMMENT_ID)).thenReturn(Optional.of(commentByCommenter()));
        commenterIsBob();

        CommentResponse response = service.updateMessage(COMMENTER, COMMENT_ID, REQUEST);

        assertThat(response.message()).isEqualTo("nice photo");
        assertThat(response.authorUsername()).isEqualTo("bob");
    }

    @Test
    void postAuthorCannotEditSomeoneElsesComment() {
        Comment comment = commentByCommenter();
        when(commentRepository.findById(COMMENT_ID)).thenReturn(Optional.of(comment));

        assertThatThrownBy(() -> service.updateMessage(POST_AUTHOR, COMMENT_ID, REQUEST))
                .isInstanceOf(ForbiddenException.class);
        assertThat(comment.getMessage()).isEqualTo("original");
    }
}
