package com.socialgrid.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

// A post's photo, in its own table so that feed queries never load the bytes.
// Deleting the post deletes this row too (ON DELETE CASCADE in schema.sql).
@Entity
@Table(name = "post_images")
public class PostImage {

    // One photo per post, so it shares the post's ID instead of generating its own.
    @Id
    private Integer postId;

    // bytea stores the bytes in the row. Don't add @Lob: on Postgres it switches to a separate large-object store.
    @Column(nullable = false, columnDefinition = "bytea")
    private byte[] data;

    protected PostImage() {
    }

    public PostImage(Integer postId, byte[] data) {
        this.postId = postId;
        this.data = data;
    }

    public Integer getPostId() {
        return postId;
    }

    public byte[] getData() {
        return data;
    }
}
