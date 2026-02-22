#!/bin/bash
# Bounds Validation Regression Test
# Validates /api/viewport bounds parsing and range checks.

set -euo pipefail

# Configuration
HTTP_PORT="${HTTP_PORT:-3000}"
BASE_URL="http://localhost:${HTTP_PORT}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

test_endpoint() {
    local test_name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_status="$5"
    local expected_error_pattern="$6"

    TESTS_RUN=$((TESTS_RUN + 1))

    log_info "Running: $test_name"

    local response
    local status_code
    local body

    if [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST \
            -H "Content-Type: application/json" \
            -d "$data" \
            "${BASE_URL}${endpoint}")
    else
        response=$(curl -s -w "\n%{http_code}" "${BASE_URL}${endpoint}")
    fi

    # Extract status code (last line) and body in a macOS/GNU compatible way.
    status_code="${response##*$'\n'}"
    body="${response%$'\n'*}"
    if [ "$body" = "$response" ]; then
        body=""
    fi

    # Check status code
    if [ "$status_code" != "$expected_status" ]; then
        log_fail "$test_name - Expected status $expected_status, got $status_code"
        echo "  Response body: $body"
        return 1
    fi

    # Check error pattern if provided
    if [ -n "$expected_error_pattern" ]; then
        if echo "$body" | grep -q "$expected_error_pattern"; then
            log_pass "$test_name - Status $status_code with expected error pattern"
            return 0
        else
            log_fail "$test_name - Status $status_code but missing expected error: '$expected_error_pattern'"
            echo "  Response body: $body"
            return 1
        fi
    else
        log_pass "$test_name - Status $status_code"
        return 0
    fi
}

run_test() {
    test_endpoint "$@" || true
}

# Check if server is running
log_info "Checking if server is running at ${BASE_URL}..."
if ! curl -s -f "${BASE_URL}/health" > /dev/null 2>&1; then
    echo -e "${RED}[ERROR]${NC} Server is not running at ${BASE_URL}"
    echo "Please start the server first: cd server && node index.js"
    exit 1
fi
log_info "Server is running ✓"
echo ""

# Run tests
echo "========================================"
echo "  Bounds Validation Regression Tests"
echo "========================================"
echo ""

# Test 1: POST /api/viewport with dirty numeric strings (should REJECT)
run_test \
    "Test 1: POST /api/viewport with dirty strings (\"-120abc\", etc.)" \
    "POST" \
    "/api/viewport" \
    '{"bounds":["-120abc","30xyz","-110foo","40bar"]}' \
    "400" \
    "non-numeric"

# Test 2: POST /api/viewport with valid numeric strings (should ACCEPT)
run_test \
    "Test 2: POST /api/viewport with valid numeric strings" \
    "POST" \
    "/api/viewport" \
    '{"bounds":["-120","30","-110","40"]}' \
    "200" \
    ""

# Test 3: POST /api/viewport with valid numeric values (not strings, should ACCEPT)
run_test \
    "Test 3: POST /api/viewport with numeric values (not strings)" \
    "POST" \
    "/api/viewport" \
    '{"bounds":[-120,30,-110,40]}' \
    "200" \
    ""

# Test 4: POST /api/viewport with empty string bounds (should REJECT)
run_test \
    "Test 4: POST /api/viewport with empty string in bounds" \
    "POST" \
    "/api/viewport" \
    '{"bounds":["",30,-110,40]}' \
    "400" \
    "non-numeric"

# Test 5: POST /api/viewport with whitespace-only bounds (should REJECT)
run_test \
    "Test 5: POST /api/viewport with whitespace-only bounds" \
    "POST" \
    "/api/viewport" \
    '{"bounds":["  ",-30,-110,40]}' \
    "400" \
    "non-numeric"

# Test 6: POST /api/viewport with latitude out of range (should REJECT)
run_test \
    "Test 6: POST /api/viewport with latitude out of range" \
    "POST" \
    "/api/viewport" \
    '{"bounds":[-120,-91,-110,40]}' \
    "400" \
    "Latitude out of range"

# Test 7: POST /api/viewport with south > north (should REJECT)
run_test \
    "Test 7: POST /api/viewport with south > north" \
    "POST" \
    "/api/viewport" \
    '{"bounds":[-120,50,-110,40]}' \
    "400" \
    "south > north"

# Test 8: POST /api/viewport with unwrapped west longitude (should ACCEPT via wrapping)
run_test \
    "Test 8: POST /api/viewport with west longitude -200 (wraps)" \
    "POST" \
    "/api/viewport" \
    '{"bounds":[-200,30,-110,40]}' \
    "200" \
    ""

# Test 9: POST /api/viewport with unwrapped east longitude (should ACCEPT via wrapping)
run_test \
    "Test 9: POST /api/viewport with east longitude 195 (wraps)" \
    "POST" \
    "/api/viewport" \
    '{"bounds":[170,-10,195,10]}' \
    "200" \
    ""

# Summary
echo ""
echo "========================================"
echo "  Test Summary"
echo "========================================"
echo "Tests run:    $TESTS_RUN"
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
    echo ""
    echo -e "${RED}REGRESSION TESTS FAILED${NC}"
    exit 1
else
    echo "Tests failed: 0"
    echo ""
    echo -e "${GREEN}ALL REGRESSION TESTS PASSED ✓${NC}"
    exit 0
fi
