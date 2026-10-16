package com.socialgrid.exception;

import com.socialgrid.dto.ErrorResponse;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    // Builds the exception Spring throws for a failed @Valid, with errors in exactly the order given,
    // so tests can pin down behaviour the real validator leaves to chance.
    private static MethodArgumentNotValidException invalid(FieldError... errors) throws Exception {
        BeanPropertyBindingResult result = new BeanPropertyBindingResult(new Object(), "registerRequest");
        for (FieldError e : errors) {
            result.addError(e);
        }
        MethodParameter param = new MethodParameter(Object.class.getMethod("equals", Object.class), 0);
        return new MethodArgumentNotValidException(param, result);
    }

    private static FieldError error(String field, String code, String message) {
        return new FieldError("registerRequest", field, null, false, new String[]{code}, null, message);
    }

    @Test
    void validationGivesOneMessagePerField() throws Exception {
        ResponseEntity<ErrorResponse> res = handler.handleValidation(invalid(
                error("username", "Size", "Username must be 3–30 characters"),
                error("email", "Email", "Enter a valid email address")));

        assertThat(res.getStatusCode().value()).isEqualTo(400);
        assertThat(res.getBody().fieldErrors()).containsExactly(
                Map.entry("username", "Username must be 3–30 characters"),
                Map.entry("email", "Enter a valid email address"));
        assertThat(res.getBody().message())
                .isEqualTo("username: Username must be 3–30 characters; email: Enter a valid email address");
    }

    @Test
    void notBlankWinsWhenReportedAfterSize() throws Exception {
        ResponseEntity<ErrorResponse> res = handler.handleValidation(invalid(
                error("password", "Size", "Password must be 8–72 characters"),
                error("password", "NotBlank", "Password is required")));

        assertThat(res.getBody().fieldErrors()).containsExactly(Map.entry("password", "Password is required"));
    }

    @Test
    void notBlankWinsWhenReportedBeforeSize() throws Exception {
        ResponseEntity<ErrorResponse> res = handler.handleValidation(invalid(
                error("password", "NotBlank", "Password is required"),
                error("password", "Size", "Password must be 8–72 characters")));

        assertThat(res.getBody().fieldErrors()).containsExactly(Map.entry("password", "Password is required"));
    }

    @Test
    void firstMessageKeptWhenNeitherIsNotBlank() throws Exception {
        ResponseEntity<ErrorResponse> res = handler.handleValidation(invalid(
                error("email", "Email", "Enter a valid email address"),
                error("email", "Size", "too long")));

        assertThat(res.getBody().fieldErrors()).containsExactly(Map.entry("email", "Enter a valid email address"));
    }

    @Test
    void conflictWithFieldCarriesFieldErrors() {
        ResponseEntity<ErrorResponse> res = handler.handleConflict(
                new ConflictException("username", "Username already taken"));

        assertThat(res.getStatusCode().value()).isEqualTo(409);
        assertThat(res.getBody().message()).isEqualTo("Username already taken");
        assertThat(res.getBody().fieldErrors()).containsExactly(Map.entry("username", "Username already taken"));
    }

    @Test
    void conflictWithoutFieldHasNoFieldErrors() {
        ResponseEntity<ErrorResponse> res = handler.handleConflict(new ConflictException("Post already liked"));

        assertThat(res.getStatusCode().value()).isEqualTo(409);
        assertThat(res.getBody().fieldErrors()).isNull();
    }

    // The exception's own text ("Bad credentials", or a hint about which check failed) is never echoed back.
    @Test
    void badCredentialsIs401WithFixedMessage() {
        ResponseEntity<ErrorResponse> res = handler.handleBadCredentials(
                new BadCredentialsException("user ghost not found"));

        assertThat(res.getStatusCode().value()).isEqualTo(401);
        assertThat(res.getBody().error()).isEqualTo("Unauthorized");
        assertThat(res.getBody().message()).isEqualTo("Invalid username/email or password");
        assertThat(res.getBody().fieldErrors()).isNull();
    }

    @Test
    void nonFieldErrorsHaveNoFieldErrors() {
        assertThat(handler.handleNotFound(new NotFoundException("x")).getBody().fieldErrors()).isNull();
        assertThat(handler.handleForbidden(new ForbiddenException("x")).getBody().fieldErrors()).isNull();
        assertThat(handler.handleBadRequest(new BadRequestException("x")).getBody().fieldErrors()).isNull();
        assertThat(handler.handleUnreadable(new HttpMessageNotReadableException("x",
                new MockHttpInputMessage(new byte[0]))).getBody().fieldErrors()).isNull();
        assertThat(handler.handleIntegrity(new DataIntegrityViolationException("x")).getBody().fieldErrors())
                .isNull();
    }
}
