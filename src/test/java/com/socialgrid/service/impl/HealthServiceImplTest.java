package com.socialgrid.service.impl;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HealthServiceImplTest {

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final HealthServiceImpl health = new HealthServiceImpl(jdbc);

    @Test
    void upWhenSelectOneAnswers() {
        when(jdbc.queryForObject("SELECT 1", Integer.class)).thenReturn(1);
        assertThat(health.databaseUp()).isTrue();
    }

    @Test
    void downWhenTheDatabaseCantBeReached() {
        when(jdbc.queryForObject("SELECT 1", Integer.class))
                .thenThrow(new DataAccessResourceFailureException("connection refused"));
        assertThat(health.databaseUp()).isFalse();
    }
}
