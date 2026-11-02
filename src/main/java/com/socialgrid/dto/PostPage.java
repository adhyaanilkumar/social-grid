package com.socialgrid.dto;

import java.util.List;

// One page of a feed. Pass nextCursor back as "before" to get the next page; it's null on the last page.
public record PostPage(List<PostView> items, Integer nextCursor) {
}
