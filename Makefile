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

# Pass stamps: build, lint and test each record the commit they passed on in .git/checks/<name>.
# .claude/hooks/open_pr_when_green.py opens a PR to main only when all three match the current commit.
# A run with uncommitted changes to these paths records "dirty", because what passed isn't what the PR would contain.
CODE_PATHS := src frontend tests pom.xml Makefile docker-compose.yml Dockerfile
CHECKS_DIR = $$(git rev-parse --git-dir)/checks
define clear_pass
	@mkdir -p "$(CHECKS_DIR)" && rm -f "$(CHECKS_DIR)/$(1)"
endef
define record_pass
	@if [ -z "$$(git status --porcelain -- $(CODE_PATHS) ':!**/__pycache__/**')" ]; then \
		git rev-parse HEAD > "$(CHECKS_DIR)/$(1)"; \
	else \
		echo dirty > "$(CHECKS_DIR)/$(1)"; \
		echo "Note: uncommitted code changes, so this pass can't trigger the merge to main. Commit, then re-run."; \
	fi
endef

.PHONY: build lint test test-white test-black test-ui test-journey stack-up

# Compiles test code too (-DskipTests skips running tests, not compiling them).
build:
	$(call clear_pass,build)
	$(MVN) -q -DskipTests package
	cd frontend && $(NPM) run build
	docker compose build
	$(call record_pass,build)
	@echo "Build succeeded"

# Treats Java compiler warnings and oxlint warnings as failures.
lint:
	$(call clear_pass,lint)
	$(MVN) -q -Plint clean test-compile
	cd frontend && $(NPX) oxlint --deny-warnings
	$(call record_pass,lint)
	@echo "Lint succeeded"

test:
	$(call clear_pass,test)
	$(MAKE) test-white test-black test-ui
	$(call record_pass,test)
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
