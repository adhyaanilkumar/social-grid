package com.socialgrid.controller;

import com.socialgrid.config.CorsConfig;
import com.socialgrid.config.SecurityConfig;
import com.socialgrid.service.HealthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// The uptime monitor's target (maintain-plan.md MT3). Real security config, so it's reached anonymously
// the way UptimeRobot hits it: Accept */*, no cookies.
@WebMvcTest(HealthController.class)
@Import({SecurityConfig.class, CorsConfig.class})
class HealthControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private HealthService healthService;

    // SecurityConfig's AuthenticationManager needs one; the @WebMvcTest slice doesn't load @Service beans.
    @MockitoBean
    private UserDetailsService userDetailsService;

    @Test
    void upWhenTheDatabaseAnswers() throws Exception {
        when(healthService.databaseUp()).thenReturn(true);

        mvc.perform(get("/api/health").accept(MediaType.ALL))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"UP\"}", JsonCompareMode.STRICT));
    }

    // 503, so the free UptimeRobot plan (2xx and 3xx count as up) alerts when the database is down.
    // The body says only DOWN: no exception text or connection details for an anonymous caller.
    @Test
    void downWith503WhenTheDatabaseDoesNot() throws Exception {
        when(healthService.databaseUp()).thenReturn(false);

        mvc.perform(get("/api/health").accept(MediaType.ALL))
                .andExpect(status().isServiceUnavailable())
                .andExpect(content().json("{\"status\":\"DOWN\"}", JsonCompareMode.STRICT));
    }

    // B19: UptimeRobot's free plan sends HEAD, not GET (the method is a paid setting). Spring answers HEAD from
    // the GET handler, but security only let GET through, so the monitor got 401 and went "Down".
    @Test
    void headIsAllowedForTheMonitor() throws Exception {
        when(healthService.databaseUp()).thenReturn(true);

        mvc.perform(head("/api/health").accept(MediaType.ALL))
                .andExpect(status().isOk());
    }

    // A ping every 5 minutes must not leave a session behind (B16).
    @Test
    void createsNoSession() throws Exception {
        when(healthService.databaseUp()).thenReturn(true);

        MvcResult result = mvc.perform(get("/api/health").accept(MediaType.ALL)).andReturn();
        assertThat(result.getRequest().getSession(false)).isNull();
    }
}
