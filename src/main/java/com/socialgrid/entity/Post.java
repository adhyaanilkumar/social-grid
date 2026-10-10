package com.socialgrid.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "posts")
public class Post {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer postId;

    @Column(nullable = false)
    private Integer authorId;

    private String mediaUrl;

    @Column(length = 2200)
    private String caption;

    protected Post() {
    }

    public Post(Integer authorId, String mediaUrl, String caption) {
        this.authorId = authorId;
        this.mediaUrl = mediaUrl;
        this.caption = caption;
    }

    public Integer getPostId() {
        return postId;
    }

    public Integer getAuthorId() {
        return authorId;
    }

    public String getMediaURL() {
        return mediaUrl;
    }

    public void setMediaURL(String mediaUrl) {
        this.mediaUrl = mediaUrl;
    }

    public String getCaption() {
        return caption;
    }

    public void setCaption(String caption) {
        this.caption = caption;
    }
}
