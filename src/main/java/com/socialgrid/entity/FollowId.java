package com.socialgrid.entity;

import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;

// Composite key: one row per (follower, followee) pair.
@Embeddable
public class FollowId implements Serializable {

    private Integer followerId;
    private Integer followeeId;

    protected FollowId() {
    }

    public FollowId(Integer followerId, Integer followeeId) {
        this.followerId = followerId;
        this.followeeId = followeeId;
    }

    public Integer getFollowerId() {
        return followerId;
    }

    public Integer getFolloweeId() {
        return followeeId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof FollowId other)) return false;
        return Objects.equals(followerId, other.followerId) && Objects.equals(followeeId, other.followeeId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(followerId, followeeId);
    }
}
