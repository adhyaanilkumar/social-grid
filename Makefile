# Project checks required by CLAUDE.md: make build, make test, make lint.
#
# Written for GNU make from MSYS2 on Windows. Recipes run in MSYS2's bash, not the WSL bash.exe in system32.
SHELL := /usr/bin/bash
.SHELLFLAGS := -eu -o pipefail -c

# Stops MSYS2 rewriting arguments that look like Unix paths, such as /api/... or docker exec arguments.
export MSYS2_ARG_CONV_EXCL := *

ifeq ($(OS),Windows_NT)
  MVN := mvn.cmd
  NPM := npm.cmd
  NPX := npx.cmd
else
  MVN := mvn
  NPM := npm
  NPX := npx
endif
PYTHON ?= python

.PHONY: build lint test test-white test-black test-ui test-journey stack-up

# Compiles test code too (-DskipTests skips running tests, not compiling them).
build:
	$(MVN) -q -DskipTests package
	cd frontend && $(NPM) run build
	docker compose build
	@echo "Build succeeded"

# Treats Java compiler warnings and oxlint warnings as failures.
lint:
	$(MVN) -q -Plint clean test-compile
	cd frontend && $(NPX) oxlint --deny-warnings
	@echo "Lint succeeded"

test: test-white test-black test-ui
	@echo "All tests passed"

# JUnit starts its own throwaway Postgres through Testcontainers, so it doesn't need the stack.
test-white:
	$(MVN) test

test-black: stack-up
	$(PYTHON) -m pytest tests/blackbox

# The 7.4 journey restarts the backend, so it runs separately through test-journey.
test-ui: stack-up
	cd frontend && $(NPX) playwright test --grep-invert @journey

test-journey: stack-up
	cd frontend && E2E_BASE_URL=http://localhost:5173 $(NPX) playwright test --grep @journey --workers=1

stack-up:
	docker compose up -d --build
	$(PYTHON) tests/wait_for_stack.py
