package com.socialgrid.repository;

import com.socialgrid.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Integer> {

    Optional<User> findByUsername(String username);

    Optional<User> findByEmail(String email);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    // Spring Data builds this query from the method name: a case-insensitive "contains" match, excluding one user.
    List<User> findTop20ByUsernameContainingIgnoreCaseAndIdNotOrderByUsernameAsc(String username, Integer excludedId);
}
