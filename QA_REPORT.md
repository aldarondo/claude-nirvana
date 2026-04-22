# QA Audit Report — claude-nirvana
**Date:** 2026-04-22

## Executive Summary
The claude-nirvana project is a small MCP server for controlling a Nirvana pool heater via reverse-engineered cloud API. Good baseline: 16 passing unit tests, clean structure, solid documentation. However, several issues were identified across security, test coverage, and code quality.

**Stats:**
- Source Code: 582 lines (4 files)
- Tests: 224 lines (5 files, 16 passing + 9 todo)
- Documentation: 172 lines (3 files)

---

## 1. BUGS

### 1.1 Auth Session Not Cleared After Refresh Failure [MAJOR]
**Location:** `src/auth.js:37-42`

If `refreshSession()` throws (not returns null), the error is caught but execution silently continues to `signIn()`, potentially falling back to password auth on ANY error — including network issues, invalid credentials, Cognito API issues. All failures are treated the same.

**Recommendation:** Log the error before swallowing; distinguish between recoverable (network) and permanent (credentials) failures.

---

### 1.2 Temperature Validation Missing Min/Max Bounds [MINOR]
**Location:** `src/index.js:145` & `src/api.js:114`

The `set_temperature` tool accepts any numeric value with zero bounds validation. A user could set the pool temperature to `-100°C` or `500°F` with no warning, sending malformed API requests to the backend.

**Recommendation:** Add temperature range validation (e.g., 10-50°C / 50-122°F).

---

### 1.3 Log Rotation Race Condition [MINOR]
**Location:** `src/logger.js:14-23`

If the log file is deleted between `fs.existsSync()` and `fs.renameSync()`, an uncaught error is thrown. The try-catch catches it, but the error is written to stderr only — not captured or surfaced.

**Recommendation:** Wrap rotation in try-catch and explicitly log failures.

---

## 2. TEST COVERAGE

### 2.1 Integration Tests Not Implemented [CRITICAL]
**Location:** `tests/integration/mcp.test.js` & `tests/integration/placeholder.test.js`

Both integration test files contain only `.test.todo()` stubs — 0 real tests. Credentials were confirmed as of 2026-04-22 but integration tests were never written.

**Missing:**
- Real MCP server endpoint validation
- Tool invocation with live auth
- Error handling when credentials are invalid
- SSE transport connectivity

---

### 2.2 API Client Tests Miss Edge Cases [MAJOR]
**Location:** `tests/unit/api.test.js`

**Missing coverage:**
- Network errors (Axios timeout, 500 errors, connection refused)
- Malformed JSON or missing fields in API responses
- Concurrent auth token scenarios
- Incorrect mode casing validation

---

### 2.3 Logger Test Cleanup Missing [MINOR]
**Location:** `tests/unit/logger.test.js:17`

No `beforeEach()` to reset log state between tests — tests may interfere with each other if run out of order.

---

## 3. CODE QUALITY

### 3.1 Silent Error Swallowing in Auth Cache [MAJOR]
**Location:** `src/auth.js:40`

`catch (_)` discards the rejection reason entirely, making auth failures opaque to debugging. All auth errors (network, credentials, Cognito API) are silently converted to a password-auth retry.

---

### 3.2 Express App Not Isolated for Testing [MAJOR]
**Location:** `src/index.js:198-223`

SSE transport is tightly coupled to startup code. The Express app and transport map cannot be unit-tested in isolation. Integration tests that try to start the server in SSE mode will bind port 8769 and hang.

**Recommendation:** Extract SSE setup into a factory function returning `{ server, app }`.

---

### 3.3 No Input Sanitization for API Parameters [MINOR]
**Location:** `src/api.js` & `src/index.js`

`card_id` not validated as a string format; temperature could be `Infinity` or `NaN`; mode strings checked for membership but not sanitized.

---

### 3.4 MCP Error Responses Expose Internal Details [MINOR]
**Location:** `src/index.js:186-188`

Raw Cognito error messages (e.g., "User does not exist in the User Pool") are returned directly to Claude, enabling account enumeration.

---

## 4. DOCUMENTATION

### 4.1 README Missing Critical Setup Details [MAJOR]
**Location:** `README.md`

**Missing:**
- Troubleshooting section
- Sample API response output
- Supported temperature ranges
- Expected Docker log output
- Credentials security warning

---

### 4.2 ROADMAP.md References Non-Existent File [MINOR]
**Location:** `ROADMAP.md:12`

References `apk-research/FINDINGS.md` which is in `.gitignore` — missing after a fresh clone.

---

### 4.3 Incomplete Tool Documentation [MINOR]
**Location:** `src/index.js:59-69`

`set_temperature` description doesn't explain how to determine which temperature unit is active (requires calling `get_status` first).

---

## 5. ORGANIZATION

### 5.1 Placeholder Test Files [MINOR]
**Location:** `tests/unit/placeholder.test.js` & `tests/integration/placeholder.test.js`

Two stub files with only `test.todo()` calls clutter the test suite and suggest incomplete state.

---

### 5.2 Environment Variable Documentation Scattered [MINOR]

Env vars documented in three places: `README.md`, `.env.example`, and hardcoded defaults in `src/index.js`. No single source of truth.

---

## 6. SECURITY

### 6.1 SSE Transport Has No Authentication [CRITICAL]
**Location:** `src/index.js:204-209`

The `/sse` endpoint accepts any connection without validating caller identity. Any client on the LAN can connect and immediately gain full control of the heat pump.

**Recommendation:** Add Bearer token / API key validation; whitelist IPs or restrict to localhost.

---

### 6.2 Potential Credential Exposure in Logs [CRITICAL]
**Location:** `src/logger.js` (affects all tools)

Tool args and results are logged without credential scrubbing. If Cognito returns credentials in an error message, they would be written to `/app/data/nirvana.log` — a Docker volume that may be backed up unencrypted.

**Recommendation:** Implement credential scrubbing in logger; never log full parameter objects.

---

### 6.3 No CORS or Request Origin Validation [MAJOR]
**Location:** `src/index.js:199-200`

No CORS headers or origin validation. A malicious website could make cross-origin requests from the browser to the MCP server and control the heater (CSRF).

---

### 6.4 Dependency Versions Not Pinned [MAJOR]
**Location:** `package.json:25-30`

All dependencies use caret ranges (`^1.x.x`), allowing automatic minor/patch updates that could introduce breaking changes or security vulnerabilities.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 4 |
| Major | 10 |
| Minor | 11 |

## Top 3 Most Important Issues

1. **SSE endpoint has no authentication** — any LAN client can control the heater
2. **Zero integration tests** — no end-to-end verification the server actually works
3. **Potential credential exposure in logs** — Cognito errors could leak credentials to log file
