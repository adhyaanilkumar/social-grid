package com.socialgrid.service.impl;

import com.socialgrid.entity.Like;
import com.socialgrid.entity.LikeId;
import com.socialgrid.exception.ConflictException;
import com.socialgrid.exception.NotFoundException;
import com.socialgrid.repository.LikeRepository;
import com.socialgrid.repository.PostRepository;
import com.socialgrid.service.LikeService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LikeServiceImpl implements LikeService {

    private final LikeRepository likeRepository;
    private final PostRepository postRepository;

    public LikeServiceImpl(LikeRepository likeRepository, PostRepository postRepository) {
        this.likeRepository = likeRepository;
        this.postRepository = postRepository;
    }

    @Override
    @Transactional
    public Like createLike(Integer userId, Integer postId) {
        if (!postRepository.existsById(postId)) {
            throw new NotFoundException("Post not found");
        }
        LikeId id = new LikeId(postId, userId);
        if (likeRepository.existsById(id)) {
            throw new ConflictException("Post already liked");
        }
        return likeRepository.save(new Like(id));
    }

    @Override
    @Transactional
    public void deleteLike(Integer userId, Integer postId) {
        LikeId id = new LikeId(postId, userId);
        if (!likeRepository.existsById(id)) {
            throw new NotFoundException("Like not found");
        }
        likeRepository.deleteById(id);
    }
}
