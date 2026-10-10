package com.socialgrid.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "comments")
public class Comment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer commentId;

    @Column(nullable = false)
    private Integer authorId;

    @Column(nullable = false)
    private Integer postId;

    @Column(nullable = false, length = 1000)
    private String message;

    protected Comment() {
    }

    public Comment(Integer authorId, Integer postId, String message) {
        this.authorId = authorId;
        this.postId = postId;
        this.message = message;
    }

    public Integer getCommentId() {
        return commentId;
    }

    public Integer getAuthorId() {
        return authorId;
    }

    public Integer getPostId() {
        return postId;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
