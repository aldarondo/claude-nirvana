# QA Audit Report: claude-nirvana
**Date:** 2026-04-25
**Auditor:** Claude Code QA Analysis
**Test Status:** 70 passing, 6 skipped (api.live requires credentials)
**Overall Rating:** 6/10 — Functional but requires fixes for production readiness

---

## 1. BUGS

### Critical

**BUG #1: Port Configuration Mismatch (Deployment Risk)**
- **Severity:** CRITICAL
- **Location:** `src/index.js:219`, `docker-compose.yml:15`, `.env.example:8`, `README.md:54,65`
- **Issue:**
  - Code default: `8769` (`const MCP_PORT = parseInt(process.env.MCP_PORT || '8769', 10)`)
  - `.env.example`: `MCP_PORT=8769`
  - `docker-compose.yml`: Default is `8774` (`MCP_PORT=${MCP_PORT:-8774}`)
  - `README.md`: Documents `8774` as the port
  - `Dockerfile`: Exposes `8769`
- **Impact:** Docker deployment will bind to port 8774 while code defaults to 8769.
- **Fix:** Consolidate to 8774 everywhere.

### Major

**BUG #2: Missing Jest Import in logger.test.js**
- **Severity:** MAJOR
- **Location:** `tests/unit/logger.test.js:17,26`
- **Issue:** `beforeEach()`, `afterAll()` used without importing from jest globals.
- **Fix:** Add: `import { describe, test, expect, beforeEach, afterAll } from '@jest/globals';`

**BUG #3: Haste Module Naming Collision**
- **Severity:** MAJOR
- **Location:** `.claude/worktrees/serene-carson-e2db37/`
- **Issue:** Jest finds duplicate `package.json` in worktree, causing non-deterministic test behavior.
- **Fix:** Add `.claude/worktrees/*/` to jest testPathIgnorePatterns.

---

## 2. TEST COVERAGE

### Coverage Summary

| File | Statements | Branches | Functions | Lines | Status |
|------|-----------|----------|-----------|-------|--------|
| src/api.js | 86.79% | 94.11% | 80% | 86% | ✅ Good |
| src/auth.js | 11.76% | 0% | 0% | 12.9% | ❌ CRITICAL |
| src/index.js | 61.25% | 57.5% | 50% | 66.66% | ⚠️ Major gaps |
| src/logger.js | 81.25% | 68.75% | 100% | 85.71% | ✅ Good |
| **Overall** | **67.58%** | **72.56%** | **63.49%** | **70.76%** | ⚠️ Below 80% |

**COVERAGE #1: auth.js — Zero Coverage (CRITICAL)**
- `getAccessToken()`, `refreshSession()`, `signIn()` never tested; session caching/expiry untested.
- **Fix:** Create `tests/unit/auth.test.js`

**COVERAGE #2: index.js SSE Transport Code Untested (MAJOR)**
- Express server setup, `/mcp` POST handler, error paths — all uncovered.
- **Fix:** Add integration test for SSE transport

**COVERAGE #3: Unknown Tool Error Path (MAJOR)**
- `src/index.js:200` — default switch case never triggered in tests.
- **Fix:** Add test case for unknown tool name

**COVERAGE #4: logger.js Rotation Edge Cases (MINOR)**
- Rotation error handling, `ensureDir()` errors, file write errors untested.

**COVERAGE #5: api.live.test.js — 6 Tests Always Skipped (MINOR)**
- Credentials not available in CI; skip reason not documented.

---

## 3. CODE QUALITY

**QUALITY #1: Global Session State in auth.js (MAJOR)**
- `src/auth.js:20` — `let cachedSession = null;` module-level mutable state. `clearSession()` exported but never called.

**QUALITY #2: No Input Validation on card_id (MAJOR)**
- `src/index.js:143,154,162,171,179,186,193` — only checks truthiness, not format.
- **Fix:** Validate non-empty string; check format if known.

**QUALITY #3: No Retry for Axios Timeout (MAJOR)**
- `src/api.js:46` — 15s timeout but no retry logic.
- **Fix:** Add retry wrapper with exponential backoff.

**QUALITY #4: Incomplete Temperature Validation (MAJOR)**
- `src/index.js:164` — missing NaN/Infinity/range checks.
- **Fix:** `if (!Number.isFinite(temperature) || temperature < 1 || temperature > 110)`

**QUALITY #5: No Structured Error Codes (MODERATE)**
- `src/index.js:205` — callers can't distinguish auth failure vs network failure vs invalid input.

**QUALITY #6: mode.toUpperCase() Without Null Check (MINOR)**
- `src/api.js:128` — throws before validation error if mode is null/undefined.

---

## 4. DOCUMENTATION

**DOCS #1: No Tool API Reference (MAJOR)**
- No documented input/output schemas, examples, or error responses for each tool.
- **Fix:** Add Tool Reference section to README.md

**DOCS #2: Port Contradiction in README (MAJOR)**
- README says 8774; `.env.example` says 8769. (See BUG #1)

**DOCS #3: Incomplete Troubleshooting Guide (MODERATE)**
- No Docker deployment failure section, port conflict guidance, or log examples.

**DOCS #4: No Architecture Documentation (MODERATE)**
- No component diagram, request flow, or explanation of auth caching/transport modes.

**DOCS #5: Security Section Too Brief (MODERATE)**
- SSE endpoint auth described as "in active development" with no future plan documented.

---

## 5. ORGANIZATION

**ORG #1: Haste Module Collision from Worktree (MAJOR)**
- `.claude/worktrees/serene-carson-e2db37/` causing Jest collision warnings. (See BUG #3)

**ORG #2: APK Research Artifacts in Version Control (MINOR)**
- `./apk-research/` is `.gitignore`d but directory still present, bloating repo.
- **Fix:** `git rm -r --cached apk-research/`

**ORG #3: Inconsistent Test File Naming (MINOR)**
- `api.live.test.js` naming non-standard; no documented test organization convention.

---

## 6. SECURITY

**SEC #1: Plaintext Credentials in .env (CRITICAL)**
- Nirvana username/password in plaintext; no credential rotation documentation.

**SEC #2: Unauthenticated SSE Endpoint (CRITICAL)**
- `src/index.js:225-234` — `/mcp` endpoint has no auth, no rate limiting.
- Anyone on the LAN can control the heater (safety risk).
- **Fix:** Implement API key auth and rate limiting before production.

**SEC #3: Sensitive Information in Logs (MAJOR)**
- `src/logger.js:64-79` — scrubbing only in `logError()`, not in `logToolCall()` or `logStatus()`.
- `card_id` logged in plaintext (line 48).
- **Fix:** Apply scrubbing consistently; hash or omit card_id from logs.

**SEC #4: No Request Body Validation in Express POST (MAJOR)**
- `src/index.js:225` — no body size limit; DoS vector.
- **Fix:** `express.json({ limit: '1mb' })` + body format check.

**SEC #5: Weak Temperature Range Validation (MODERATE)**
- `src/api.js:115` — doesn't validate against device's actual temp unit; could allow unsafe values.

**SEC #6: No Token Expiry Clock Validation (MODERATE)**
- `src/auth.js:31-34` — expiry from JWT not validated against server time; stale tokens possible.

---

## Issues by Severity

| Severity | Count |
|----------|-------|
| CRITICAL | 4 |
| MAJOR | 9 |
| MODERATE | 6 |
| MINOR | 5 |
| **Total** | **24** |

---

## Top 3 Most Important

1. **Port mismatch (BUG #1)** — Docker deploy silently uses wrong port; `src/index.js:219` + `docker-compose.yml:15`
2. **Zero auth.js coverage (COVERAGE #1)** — Authentication code completely untested; `src/auth.js`
3. **Unauthenticated SSE endpoint (SEC #2)** — Anyone on LAN can control the heater; `src/index.js:225-234`
