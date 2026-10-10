package com.socialgrid.entity;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "follows")
public class Follows {

    @EmbeddedId
    private FollowId id;

    protected Follows() {
    }

    public Follows(FollowId id) {
        this.id = id;
    }

    public FollowId getId() {
        return id;
    }
}
