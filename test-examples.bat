@echo off
REM Example test script for API Gateway (Windows)
REM Make sure the gateway is running: docker-compose up -d

set BASE_URL=http://localhost:3000
set API_KEY=key-abc123

echo =========================================
echo API Gateway Testing Script
echo =========================================
echo.

REM Test 1: Health Check
echo Test 1: Health Check
curl -s %BASE_URL%/health
echo.
echo.

REM Test 2: Initial Metrics
echo Test 2: Initial Metrics
curl -s %BASE_URL%/metrics
echo.
echo.

REM Test 3: Basic Request
echo Test 3: Basic Request (Default Policy)
curl -s %BASE_URL%/api/users
echo.
echo.

REM Test 4: Request with API Key
echo Test 4: Request with API Key
curl -s -H "X-API-Key: %API_KEY%" %BASE_URL%/api/users
echo.
echo.

REM Test 5: Rate Limiting Test
echo Test 5: Rate Limiting Test
echo Making 110 requests (default limit is 100)...
set ALLOWED=0
set BLOCKED=0

for /L %%i in (1,1,110) do (
    for /f "tokens=*" %%j in ('curl -s -o nul -w "%%{http_code}" %BASE_URL%/api/users') do set HTTP_CODE=%%j
    if "!HTTP_CODE!"=="200" (
        set /a ALLOWED+=1
    ) else if "!HTTP_CODE!"=="429" (
        set /a BLOCKED+=1
        if !BLOCKED!==1 echo First rate limit hit at request %%i
    )
)

echo Allowed: %ALLOWED%
echo Blocked: %BLOCKED%
echo.

REM Test 6: Check Metrics
echo Test 6: Metrics After Requests
curl -s %BASE_URL%/metrics
echo.
echo.

echo =========================================
echo Testing Complete!
echo =========================================

