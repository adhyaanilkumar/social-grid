package com.socialgrid.service;

// Whether the app can serve requests, for the uptime monitor (GET /api/health, maintain-plan.md MT3).
public interface HealthService {

    // True if the database answers a trivial query.
    boolean databaseUp();
}
