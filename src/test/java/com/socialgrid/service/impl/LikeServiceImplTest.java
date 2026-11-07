package com.socialgrid.service.impl;

import com.socialgrid.entity.Like;
import com.socialgrid.entity.LikeId;
import com.socialgrid.exception.ConflictException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.repository.LikeRepository;
import com.socialgrid.repository.PostRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.AdditionalAnswers.returnsFirstArg;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LikeServiceImplTest {

    private static final LikeId ID = new LikeId(10, 1);

    @Mock
    private LikeRepository likeRepository;
    @Mock
    private PostRepository postRepository;
    @InjectMocks
    private LikeServiceImpl service;

    @Test
    void likeSavesThePair() {
        when(postRepository.existsById(10)).thenReturn(true);
        when(likeRepository.existsById(ID)).thenReturn(false);
        when(likeRepository.save(any(Like.class))).then(returnsFirstArg());

        assertThat(service.createLike(1, 10).getLikeId()).isEqualTo(ID);
    }

    @Test
    void likingMissingPostIs404() {
        when(postRepository.existsById(10)).thenReturn(false);

        assertThatThrownBy(() -> service.createLike(1, 10)).isInstanceOf(NotFoundException.class);
        verifyNoInteractions(likeRepository);
    }

    @Test
    void likingTwiceIs409() {
        when(postRepository.existsById(10)).thenReturn(true);
        when(likeRepository.existsById(ID)).thenReturn(true);

        assertThatThrownBy(() -> service.createLike(1, 10)).isInstanceOf(ConflictException.class);
        verify(likeRepository, never()).save(any());
    }

    @Test
    void unlikeDeletesThePair() {
        when(likeRepository.existsById(ID)).thenReturn(true);

        service.deleteLike(1, 10);

        verify(likeRepository).deleteById(ID);
    }

    @Test
    void unlikeWithNoLikeIs404() {
        when(likeRepository.existsById(ID)).thenReturn(false);

        assertThatThrownBy(() -> service.deleteLike(1, 10)).isInstanceOf(NotFoundException.class);
        verify(likeRepository, never()).deleteById(any());
    }
}
