package com.socialgrid.entity;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "likes")
public class Like {

    @EmbeddedId
    private LikeId likeId;

    protected Like() {
    }

    public Like(LikeId likeId) {
        this.likeId = likeId;
    }

    public LikeId getLikeId() {
        return likeId;
    }
}
