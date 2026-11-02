package com.socialgrid.dto;

// One post as a feed shows it. Built directly by the feed queries, so a page takes one database query.
public record PostView(
        Integer postId,
        Integer authorId,
        String authorUsername,
        String mediaUrl,
        String caption,
        Integer width,
        Integer height,
        long likeCount,
        long commentCount,
        boolean likedByMe) {
}
