package com.socialgrid.integration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Postgres refuses any text containing a NUL character (0x00), so a login identifier with one used to fail
// inside the user lookup. That error surfaced as a 409 "Request conflicts with existing data" instead of the
// generic 401 every unknown account gets. Only a real Postgres shows this, so it runs on the throwaway one.
class NulInLoginIdentifierTest extends PostgresIntegrationTest {

    @Autowired
    private WebApplicationContext context;

    private MockMvc mvc;

    @BeforeEach
    void buildMvc() {
        // Built by hand rather than with @AutoConfigureMockMvc, so this class shares the other integration
        // tests' Spring context and Postgres container.
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    private void loginAs(String identifierJson) throws Exception {
        // Qualified: PostgresIntegrationTest's own post(...) helper would shadow a static import.
        mvc.perform(MockMvcRequestBuilders.post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\":" + identifierJson + ",\"password\":\"password1\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid username/email or password"));
    }

    @Test
    void nulInUsernameIsTheGenericUnauthorized() throws Exception {
        user("alice");
        // JSON escape, so the request body is valid and the controller receives a real NUL character.
        loginAs("\"alice\\u0000\"");
    }

    @Test
    void nulInEmailIsTheGenericUnauthorized() throws Exception {
        user("alice");
        loginAs("\"alice@example.com\\u0000\"");
    }
}
