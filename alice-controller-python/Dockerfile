# Alice Controller - Python Backend with React Frontend
# 多階段構建: Stage 1 為 React 前端, Stage 2 為 Python 後端

# ============================================
# Stage 1: Build React Frontend (如果存在)
# ============================================
FROM node:22 AS react-build
WORKDIR /app/client

# 先複製 package.json 和 package-lock.json（如果存在）
COPY client/package*.json* ./

# 複製所有前端源碼（如果存在）
COPY client/ ./

# 如果 package.json 存在，安裝依賴並構建
RUN if [ -f package.json ]; then \
        npm install && \
        npm run build || (echo "前端構建失敗，將只使用後端 API" && mkdir -p dist); \
    else \
        echo "沒有前端檔案，跳過前端構建"; \
        mkdir -p dist; \
    fi

# ============================================
# Stage 2: Python Backend
# ============================================
FROM python:3.11-slim

WORKDIR /app

# 安裝系統依賴
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 複製 Python 依賴
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 複製後端源碼
COPY main.py config.py ./
COPY routes/ ./routes/

# 從 Stage 1 複製 React 構建產物（如果存在）
COPY --from=react-build /app/client/dist ./client/dist

ENV ALICE_AGENT_HOST=alice-agent
ENV ALICE_AGENT_PORT=8031
ENV PYTHONUNBUFFERED=1

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
