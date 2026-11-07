package com.socialgrid;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@SpringBootTest
@Import(TestDatabaseConfig.class)
class SocialGridApplicationTests {

    @Test
    void contextLoads() {
    }
}
