package com.socialgrid.exception;

import com.socialgrid.dto.ErrorResponse;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

// Turns exceptions thrown anywhere in a controller or service into JSON error responses.
@RestControllerAdvice
public class GlobalExceptionHandler {

    // Postgres SQLSTATE for foreign_key_violation.
    private static final String FOREIGN_KEY_VIOLATION = "23503";

    // Error code Bean Validation gives a failed @NotBlank.
    private static final String NOT_BLANK = "NotBlank";

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(NotFoundException e) {
        return build(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ErrorResponse> handleForbidden(ForbiddenException e) {
        return build(HttpStatus.FORBIDDEN, e.getMessage());
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ErrorResponse> handleConflict(ConflictException e) {
        Map<String, String> fieldErrors = e.getField() == null ? null : Map.of(e.getField(), e.getMessage());
        return build(HttpStatus.CONFLICT, e.getMessage(), fieldErrors);
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ErrorResponse> handleBadRequest(BadRequestException e) {
        return build(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    // Same message for an unknown account and a wrong password, so the response can't be used to find out
    // which usernames or emails are registered.
    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ErrorResponse> handleBadCredentials(BadCredentialsException e) {
        return build(HttpStatus.UNAUTHORIZED, "Invalid username/email or password");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException e) {
        List<FieldError> errors = e.getBindingResult().getFieldErrors();
        String message = errors.stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .collect(Collectors.joining("; "));
        // One message per field. A blank value also fails @Size, and the validator reports the two in no fixed
        // order, so "is required" always wins over the length message.
        Map<String, String> fieldErrors = new LinkedHashMap<>();
        for (FieldError err : errors) {
            if (NOT_BLANK.equals(err.getCode()) || !fieldErrors.containsKey(err.getField())) {
                fieldErrors.put(err.getField(), err.getDefaultMessage());
            }
        }
        return build(HttpStatus.BAD_REQUEST, message, fieldErrors);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ErrorResponse> handleUnreadable(Exception e) {
        return build(HttpStatus.BAD_REQUEST, "Malformed request");
    }

    // A constraint caught by the database. A foreign key violation means the referenced row was deleted
    // between our existence check and the insert (e.g. liking a post as it is deleted); anything else is
    // a unique constraint, e.g. two simultaneous registrations with one username.
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleIntegrity(DataIntegrityViolationException e) {
        if (NestedExceptionUtils.getMostSpecificCause(e) instanceof SQLException sql
                && FOREIGN_KEY_VIOLATION.equals(sql.getSQLState())) {
            return build(HttpStatus.NOT_FOUND, "Referenced resource not found");
        }
        return build(HttpStatus.CONFLICT, "Request conflicts with existing data");
    }

    private ResponseEntity<ErrorResponse> build(HttpStatus status, String message) {
        return build(status, message, null);
    }

    private ResponseEntity<ErrorResponse> build(HttpStatus status, String message, Map<String, String> fieldErrors) {
        return ResponseEntity.status(status)
                .body(new ErrorResponse(status.value(), status.getReasonPhrase(), message, fieldErrors));
    }
}
