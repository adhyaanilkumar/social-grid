package com.socialgrid.service.impl;

import com.socialgrid.entity.FollowId;
import com.socialgrid.entity.Follows;
import com.socialgrid.exception.BadRequestException;
import com.socialgrid.exception.ConflictException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.repository.FollowsRepository;
import com.socialgrid.repository.UserRepository;
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
class FollowServiceImplTest {

    private static final FollowId ID = new FollowId(1, 2);

    @Mock
    private FollowsRepository followsRepository;
    @Mock
    private UserRepository userRepository;
    @InjectMocks
    private FollowServiceImpl service;

    @Test
    void followSavesThePair() {
        when(userRepository.existsById(2)).thenReturn(true);
        when(followsRepository.existsById(ID)).thenReturn(false);
        when(followsRepository.save(any(Follows.class))).then(returnsFirstArg());

        Follows follows = service.follow(1, 2);

        assertThat(follows.getId()).isEqualTo(ID);
    }

    @Test
    void cannotFollowYourself() {
        assertThatThrownBy(() -> service.follow(1, 1)).isInstanceOf(BadRequestException.class);
        verifyNoInteractions(followsRepository);
    }

    @Test
    void cannotFollowUnknownUser() {
        when(userRepository.existsById(2)).thenReturn(false);

        assertThatThrownBy(() -> service.follow(1, 2)).isInstanceOf(NotFoundException.class);
        verify(followsRepository, never()).save(any());
    }

    @Test
    void cannotFollowTwice() {
        when(userRepository.existsById(2)).thenReturn(true);
        when(followsRepository.existsById(ID)).thenReturn(true);

        assertThatThrownBy(() -> service.follow(1, 2)).isInstanceOf(ConflictException.class);
        verify(followsRepository, never()).save(any());
    }

    @Test
    void unfollowDeletesThePair() {
        when(followsRepository.existsById(ID)).thenReturn(true);

        service.unfollow(1, 2);

        verify(followsRepository).deleteById(ID);
    }

    @Test
    void unfollowWhenNotFollowingIs404() {
        when(followsRepository.existsById(ID)).thenReturn(false);

        assertThatThrownBy(() -> service.unfollow(1, 2)).isInstanceOf(NotFoundException.class);
        verify(followsRepository, never()).deleteById(any());
    }
}
