package com.socialgrid.service.impl;

import com.socialgrid.entity.FollowId;
import com.socialgrid.entity.Follows;
import com.socialgrid.exception.BadRequestException;
import com.socialgrid.exception.ConflictException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.repository.FollowsRepository;
import com.socialgrid.repository.UserRepository;
import com.socialgrid.service.FollowService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FollowServiceImpl implements FollowService {

    private final FollowsRepository followsRepository;
    private final UserRepository userRepository;

    public FollowServiceImpl(FollowsRepository followsRepository, UserRepository userRepository) {
        this.followsRepository = followsRepository;
        this.userRepository = userRepository;
    }

    @Override
    @Transactional
    public Follows follow(Integer followerId, Integer followeeId) {
        if (followerId.equals(followeeId)) {
            throw new BadRequestException("Cannot follow yourself");
        }
        if (!userRepository.existsById(followeeId)) {
            throw new NotFoundException("User not found");
        }
        FollowId id = new FollowId(followerId, followeeId);
        if (followsRepository.existsById(id)) {
            throw new ConflictException("Already following");
        }
        return followsRepository.save(new Follows(id));
    }
}
