package com.socialgrid.dto;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

// Spec 4.2 and 2.3: profile URLs contain the username, so only URL-safe characters are allowed.
class RegisterRequestValidationTest {

    private static final String RULE = "Username can only use letters, numbers, dots, dashes and underscores";

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void createValidator() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void closeFactory() {
        factory.close();
    }

    private static List<String> usernameMessages(String username) {
        return validator.validate(new RegisterRequest(username, "password1", "alice@example.com")).stream()
                .filter(violation -> violation.getPropertyPath().toString().equals("username"))
                .map(ConstraintViolation::getMessage)
                .toList();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "a/b", "/abc", "abc/", "a b", " abc", "abc ", "a@b", "a%b", "a?b", "a#b", "a\\b", "a\tb", "abc\n",
            ".abc", "-abc", "_abc", "älice"})
    void disallowedUsernamesGetTheRuleMessage(String username) {
        assertThat(usernameMessages(username)).contains(RULE);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "abc", "alice", "ALICE", "Alice99", "9lives", "a.b", "a-b", "a_b", "a.b-c_d", "abc.", "abc-", "abc_",
            "a..b", "123"})
    void allowedUsernamesAreValid(String username) {
        assertThat(usernameMessages(username)).isEmpty();
    }

    @Test
    void lengthLimitsStillApply() {
        assertThat(usernameMessages("ab")).containsExactly("Username must be 3–30 characters");
        assertThat(usernameMessages("a".repeat(30))).isEmpty();
        assertThat(usernameMessages("a".repeat(31))).containsExactly("Username must be 3–30 characters");
    }
}
