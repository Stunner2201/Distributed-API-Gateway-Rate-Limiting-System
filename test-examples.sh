#!/bin/bash

# Example test script for API Gateway
# Make sure the gateway is running: docker-compose up -d

BASE_URL="http://localhost:3000"
API_KEY="key-abc123"

echo "========================================="
echo "API Gateway Testing Script"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
HEALTH=$(curl -s "$BASE_URL/health")
echo "$HEALTH" | jq . 2>/dev/null || echo "$HEALTH"
echo ""

# Test 2: Initial Metrics
echo -e "${YELLOW}Test 2: Initial Metrics${NC}"
METRICS=$(curl -s "$BASE_URL/metrics")
echo "$METRICS" | jq . 2>/dev/null || echo "$METRICS"
echo ""

# Test 3: Basic Request (No API Key)
echo -e "${YELLOW}Test 3: Basic Request (Default Policy)${NC}"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/api/users")
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')
if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}✓ Request allowed (HTTP $HTTP_CODE)${NC}"
    echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
else
    echo -e "${RED}✗ Request failed (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# Test 4: Request with API Key
echo -e "${YELLOW}Test 4: Request with API Key${NC}"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -H "X-API-Key: $API_KEY" "$BASE_URL/api/users")
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')
if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}✓ Request allowed (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}✗ Request failed (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# Test 5: Check Rate Limit Headers
echo -e "${YELLOW}Test 5: Rate Limit Headers${NC}"
HEADERS=$(curl -s -I "$BASE_URL/api/users" | grep -i "rate-limit")
echo "$HEADERS"
echo ""

# Test 6: Rate Limiting Test (Make multiple requests)
echo -e "${YELLOW}Test 6: Rate Limiting Test${NC}"
echo "Making 110 requests (default limit is 100)..."
ALLOWED=0
BLOCKED=0

for i in {1..110}; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/users")
    if [ "$HTTP_CODE" == "200" ]; then
        ALLOWED=$((ALLOWED + 1))
    elif [ "$HTTP_CODE" == "429" ]; then
        BLOCKED=$((BLOCKED + 1))
        if [ $BLOCKED -eq 1 ]; then
            echo -e "${YELLOW}First rate limit hit at request $i${NC}"
        fi
    fi
done

echo -e "${GREEN}Allowed: $ALLOWED${NC}"
echo -e "${RED}Blocked: $BLOCKED${NC}"
echo ""

# Test 7: Check Metrics After Requests
echo -e "${YELLOW}Test 7: Metrics After Requests${NC}"
METRICS=$(curl -s "$BASE_URL/metrics")
echo "$METRICS" | jq . 2>/dev/null || echo "$METRICS"
echo ""

# Test 8: Rate Limit Exceeded Response
echo -e "${YELLOW}Test 8: Rate Limit Exceeded Response${NC}"
# Make a request that should be blocked
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/api/users")
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" == "429" ]; then
    echo -e "${RED}✓ Rate limit correctly enforced (HTTP 429)${NC}"
    echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
    
    # Check Retry-After header
    RETRY_AFTER=$(curl -s -I "$BASE_URL/api/users" | grep -i "retry-after" | cut -d: -f2 | tr -d ' \r\n')
    if [ -n "$RETRY_AFTER" ]; then
        echo -e "${GREEN}✓ Retry-After header present: $RETRY_AFTER seconds${NC}"
    fi
else
    echo -e "${YELLOW}Request was allowed (may have refilled tokens)${NC}"
fi
echo ""

# Test 9: Different Endpoints
echo -e "${YELLOW}Test 9: Different Endpoints${NC}"
for endpoint in "/api/users" "/api/orders" "/api/products"; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$endpoint")
    if [ "$HTTP_CODE" == "200" ]; then
        echo -e "${GREEN}✓ $endpoint: OK${NC}"
    else
        echo -e "${RED}✗ $endpoint: HTTP $HTTP_CODE${NC}"
    fi
done
echo ""

# Test 10: Combined Policy (API Key + Endpoint)
echo -e "${YELLOW}Test 10: Combined Policy Test${NC}"
echo "Making 25 requests with API key to /api/users (combined limit: 20)..."
COMBINED_ALLOWED=0
COMBINED_BLOCKED=0

for i in {1..25}; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "X-API-Key: $API_KEY" "$BASE_URL/api/users")
    if [ "$HTTP_CODE" == "200" ]; then
        COMBINED_ALLOWED=$((COMBINED_ALLOWED + 1))
    elif [ "$HTTP_CODE" == "429" ]; then
        COMBINED_BLOCKED=$((COMBINED_BLOCKED + 1))
        if [ $COMBINED_BLOCKED -eq 1 ]; then
            echo -e "${YELLOW}Combined policy rate limit hit at request $i${NC}"
        fi
    fi
done

echo -e "${GREEN}Allowed: $COMBINED_ALLOWED${NC}"
echo -e "${RED}Blocked: $COMBINED_BLOCKED${NC}"
echo ""

echo "========================================="
echo -e "${GREEN}Testing Complete!${NC}"
echo "========================================="

