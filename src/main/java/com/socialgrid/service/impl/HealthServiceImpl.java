package com.socialgrid.service.impl;

import com.socialgrid.service.HealthService;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class HealthServiceImpl implements HealthService {

    private final JdbcTemplate jdbc;

    public HealthServiceImpl(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // SELECT 1 needs a working pool connection and a live Postgres, and reads no tables. If the database
    // hangs instead of refusing, Hikari's connection timeout (30 s) ends the wait.
    @Override
    public boolean databaseUp() {
        try {
            Integer one = jdbc.queryForObject("SELECT 1", Integer.class);
            return one != null && one == 1;
        } catch (DataAccessException e) {
            return false;
        }
    }
}
