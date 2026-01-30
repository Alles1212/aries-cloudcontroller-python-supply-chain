#!/bin/bash

# 快速測試腳本 - 驗證所有服務是否正常運行

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Testing Aries CloudController Python Demo...${NC}\n"

# 測試 Faber Controller
echo -n "Testing Faber Controller (port 9021)... "
if curl -s http://localhost:9021/api/status | grep -q '"status":"up"'; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ FAILED${NC}"
    exit 1
fi

# 測試 Alice Controller
echo -n "Testing Alice Controller (port 9031)... "
if curl -s http://localhost:9031/api/status | grep -q '"status":"up"'; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ FAILED${NC}"
    exit 1
fi

# 測試 Acme Controller
echo -n "Testing Acme Controller (port 9041)... "
if curl -s http://localhost:9041/api/status | grep -q '"status":"up"'; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ FAILED${NC}"
    exit 1
fi

# 測試 Faber Agent
echo -n "Testing Faber Agent (port 8121)... "
if curl -s http://localhost:8121/status | grep -q 'version'; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ FAILED${NC}"
    exit 1
fi

# 測試 Alice Agent
echo -n "Testing Alice Agent (port 8031)... "
if curl -s http://localhost:8031/status | grep -q 'version'; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ FAILED${NC}"
    exit 1
fi

# 測試 Acme Agent
echo -n "Testing Acme Agent (port 8041)... "
if curl -s http://localhost:8041/status | grep -q 'version'; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ FAILED${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  All services are running! 🎉         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}You can now access:${NC}"
echo "  Faber: http://localhost:9021"
echo "  Alice: http://localhost:9031"
echo "  Acme:  http://localhost:9041"
echo ""
