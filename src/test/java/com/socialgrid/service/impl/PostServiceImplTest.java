package com.socialgrid.service.impl;

import com.socialgrid.dto.PostResponse;
import com.socialgrid.entity.Post;
import com.socialgrid.entity.PostImage;
import com.socialgrid.exception.BadRequestException;
import com.socialgrid.exception.ForbiddenException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.repository.LikeRepository;
import com.socialgrid.repository.PostImageRepository;
import com.socialgrid.repository.PostRepository;
import com.socialgrid.service.ImageService.ProcessedImage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PostServiceImplTest {

    private static final byte[] JPEG = {1, 2, 3};
    private static final ProcessedImage IMAGE = new ProcessedImage(JPEG, 640, 480);

    @Mock
    private PostRepository postRepository;
    @Mock
    private PostImageRepository postImageRepository;
    @Mock
    private LikeRepository likeRepository;
    @InjectMocks
    private PostServiceImpl service;

    // Hands out ID 42, as the database would on save.
    private void saveAssignsId() {
        when(postRepository.save(any(Post.class))).thenAnswer(call -> {
            Post post = call.getArgument(0);
            ReflectionTestUtils.setField(post, "postId", 42);
            return post;
        });
    }

    private Post savedPost() {
        ArgumentCaptor<Post> saved = ArgumentCaptor.forClass(Post.class);
        verify(postRepository).save(saved.capture());
        return saved.getValue();
    }

    private static Post postBy(int authorId) {
        Post post = new Post(authorId, "caption", 100, 50);
        ReflectionTestUtils.setField(post, "postId", 42);
        return post;
    }

    @Test
    void captionOverTheLimitIsRejectedAndNothingIsSaved() {
        String caption = "x".repeat(2201);

        assertThatThrownBy(() -> service.createPost(1, IMAGE, caption))
                .isInstanceOf(BadRequestException.class)
                .hasMessage("Captions can be up to 2,200 characters");
        verifyNoInteractions(postRepository, postImageRepository);
    }

    @Test
    void captionAtTheLimitIsAccepted() {
        saveAssignsId();
        String caption = "x".repeat(2200);

        assertThat(service.createPost(1, IMAGE, caption).caption()).isEqualTo(caption);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "   ", "\n\t"})
    void blankCaptionIsStoredAsNull(String caption) {
        saveAssignsId();

        PostResponse response = service.createPost(1, IMAGE, caption);

        assertThat(response.caption()).isNull();
        assertThat(savedPost().getCaption()).isNull();
    }

    @Test
    void postAndPhotoAreSavedTogether() {
        saveAssignsId();

        PostResponse response = service.createPost(1, IMAGE, "hello");

        InOrder order = inOrder(postRepository, postImageRepository);
        order.verify(postRepository).save(any(Post.class));
        ArgumentCaptor<PostImage> photo = ArgumentCaptor.forClass(PostImage.class);
        order.verify(postImageRepository).save(photo.capture());
        assertThat(photo.getValue().getPostId()).isEqualTo(42);
        assertThat(photo.getValue().getData()).isEqualTo(JPEG);

        assertThat(response.postId()).isEqualTo(42);
        assertThat(response.authorId()).isEqualTo(1);
        assertThat(response.caption()).isEqualTo("hello");
        assertThat(response.mediaUrl()).isEqualTo("/api/posts/42/image");
        assertThat(response.likeCount()).isZero();
    }

    @Test
    void storedPhotoSizeIsKeptOnThePost() {
        saveAssignsId();

        service.createPost(1, IMAGE, null);

        Post post = savedPost();
        assertThat(ReflectionTestUtils.getField(post, "width")).isEqualTo(640);
        assertThat(ReflectionTestUtils.getField(post, "height")).isEqualTo(480);
        assertThat(post.getMediaURL()).isEqualTo("/api/posts/42/image");
    }

    @Test
    void ownerCanDeleteTheirPost() {
        Post post = postBy(1);
        when(postRepository.findById(42)).thenReturn(Optional.of(post));

        service.deletePost(1, 42);

        verify(postRepository).delete(post);
    }

    @Test
    void otherUsersCannotDeleteAPost() {
        when(postRepository.findById(42)).thenReturn(Optional.of(postBy(1)));

        assertThatThrownBy(() -> service.deletePost(2, 42)).isInstanceOf(ForbiddenException.class);
        verify(postRepository, never()).delete(any(Post.class));
    }

    @Test
    void deletingAMissingPostIs404() {
        when(postRepository.findById(42)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.deletePost(1, 42)).isInstanceOf(NotFoundException.class);
    }

    @Test
    void getImageReturnsTheStoredBytes() {
        when(postImageRepository.findById(42)).thenReturn(Optional.of(new PostImage(42, JPEG)));

        assertThat(service.getImage(42)).isEqualTo(JPEG);
    }

    @Test
    void getImageForMissingPhotoIs404() {
        when(postImageRepository.findById(42)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getImage(42)).isInstanceOf(NotFoundException.class);
    }

    @Test
    void getPostForMissingPostIs404() {
        when(postRepository.findById(42)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getPost(42)).isInstanceOf(NotFoundException.class);
    }
}
