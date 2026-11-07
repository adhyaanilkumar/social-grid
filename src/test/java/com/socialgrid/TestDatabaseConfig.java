package com.socialgrid;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Gives a test its own empty Postgres, using the same image as docker-compose.yml.
 * ServiceConnection points Spring's datasource at this container instead of the dev database.
 * Spring reuses one container across test classes that share this configuration.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestDatabaseConfig {

    @Bean
    @ServiceConnection
    PostgreSQLContainer<?> postgres() {
        return new PostgreSQLContainer<>(DockerImageName.parse("postgres:18-alpine"));
    }
}
