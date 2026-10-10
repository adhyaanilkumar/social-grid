package com.socialgrid.service;

import com.socialgrid.entity.Follows;

public interface FollowService {

    Follows follow(Integer followerId, Integer followeeId);
}
