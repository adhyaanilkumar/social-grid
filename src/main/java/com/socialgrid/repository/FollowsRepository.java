package com.socialgrid.repository;

import com.socialgrid.entity.FollowId;
import com.socialgrid.entity.Follows;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FollowsRepository extends JpaRepository<Follows, FollowId> {
}
