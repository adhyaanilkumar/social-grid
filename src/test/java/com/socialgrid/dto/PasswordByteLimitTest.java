package com.socialgrid.dto;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

// BCrypt only accepts up to 72 bytes, but @Size counts characters. A password like "é" x 40 is 40 characters and
// 80 UTF-8 bytes, so it passed validation and BCrypt then threw, giving a 500. It must fail validation instead.
class PasswordByteLimitTest {

    private static final String SIZE = "Password must be 8–72 characters";

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

    private static List<String> passwordMessages(String password) {
        return validator.validate(new RegisterRequest("alice", password, "alice@example.com")).stream()
                .filter(violation -> violation.getPropertyPath().toString().equals("password"))
                .map(ConstraintViolation::getMessage)
                .toList();
    }

    @Test
    void over72BytesButUnder72CharactersIsRejectedWithTheSizeMessage() {
        String password = "é".repeat(40);
        assertThat(password.getBytes(StandardCharsets.UTF_8)).hasSize(80);
        assertThat(passwordMessages(password)).isNotEmpty().allMatch(SIZE::equals);
    }

    @Test
    void exactly72BytesOfMultiByteCharactersIsValid() {
        assertThat(passwordMessages("é".repeat(36))).isEmpty();
    }

    @Test
    void seventyTwoAsciiCharactersIsValid() {
        assertThat(passwordMessages("a".repeat(72))).isEmpty();
    }

    @Test
    void seventyThreeAsciiCharactersStillGetsTheSizeMessage() {
        assertThat(passwordMessages("a".repeat(73))).isNotEmpty().allMatch(SIZE::equals);
    }

    @Test
    void blankPasswordStillReportsRequired() {
        assertThat(passwordMessages("")).contains("Password is required");
    }
}
