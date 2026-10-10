package com.socialgrid.entity;

import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;

// Composite key: one row per (post, user) pair, so a user can like a post at most once.
@Embeddable
public class LikeId implements Serializable {

    private Integer postId;
    private Integer userId;

    protected LikeId() {
    }

    public LikeId(Integer postId, Integer userId) {
        this.postId = postId;
        this.userId = userId;
    }

    public Integer getPostId() {
        return postId;
    }

    public Integer getUserId() {
        return userId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof LikeId other)) return false;
        return Objects.equals(postId, other.postId) && Objects.equals(userId, other.userId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(postId, userId);
    }
}
