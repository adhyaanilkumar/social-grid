package com.socialgrid.controller;

import com.socialgrid.dto.HealthResponse;
import com.socialgrid.service.HealthService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// The uptime monitor's target (maintain-plan.md MT3). Public, so UptimeRobot can call it without logging in.
// 200 means Caddy, nginx, the backend and the database all answered. 503 when the database doesn't, because
// the free UptimeRobot plan only counts 2xx and 3xx as up.
@RestController
@RequestMapping("/api/health")
public class HealthController {

    private final HealthService healthService;

    public HealthController(HealthService healthService) {
        this.healthService = healthService;
    }

    @GetMapping
    public ResponseEntity<HealthResponse> health() {
        if (healthService.databaseUp()) {
            return ResponseEntity.ok(new HealthResponse("UP"));
        }
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new HealthResponse("DOWN"));
    }
}
