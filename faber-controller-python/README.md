# Faber Controller - Python Version

基於 `aries-cloudcontroller-python` 的 Faber Controller 重寫版本。

## 🎯 專案目標

將原 Node.js + Express 版本遷移到 Python + FastAPI，使用 `aries-cloudcontroller-python` 提供型別安全的 ACA-Py 互動。

## 📦 技術棧

### 後端 (已遷移)
- **Web 框架**: FastAPI
- **ACA-Py 客戶端**: aries-cloudcontroller-python
- **型別系統**: Pydantic
- **非同步**: asyncio + aiohttp

### 前端 (保持不變)
- **框架**: React 18
- **構建工具**: Vite
- **UI**: 自定義 CSS

## 🔄 與原版本的差異

| 項目 | Node.js 版本 | Python 版本 |
|------|--------------|-------------|
| **HTTP 客戶端** | 原生 `http` 模組 | `aries-cloudcontroller-python` |
| **型別系統** | 無 (JavaScript) | 強型別 (Pydantic) |
| **API 定義** | 手動維護 | 自動同步 ACA-Py |
| **錯誤處理** | 手動檢查狀態碼 | 自動型別驗證 |
| **程式碼行數** | ~680 行 (AgentService.js) | ~400 行 (所有 routes) |

## 🚀 快速開始

### 本地開發

```bash
# 1. 安裝 Python 依賴
pip install -r requirements.txt

# 2. 設定環境變數
cp .env.example .env

# 3. 啟動後端服務
uvicorn main:app --reload --port 3000

# 4. (另一個終端) 啟動 React 前端開發伺服器
cd client
npm install
npm run dev
```

### Docker 部署

```bash
# 構建映像
docker build -t faber-controller-python .

# 運行容器
docker run -p 3000:3000 \
  -e FABER_AGENT_HOST=faber-agent \
  -e FABER_AGENT_PORT=8021 \
  faber-controller-python
```

### 使用 Docker Compose

請參考專案根目錄的 `docker-compose.yml`。

## 📁 專案結構

```
faber-controller-python/
├── main.py                 # FastAPI 應用程式入口
├── config.py               # 配置管理
├── requirements.txt        # Python 依賴
├── routes/                 # API 路由
│   ├── __init__.py
│   ├── connections.py      # 連線管理
│   ├── schemas.py          # Schema 管理
│   ├── credential_definitions.py  # CredDef 管理
│   └── credentials.py      # 憑證發放與撤銷
├── client/                 # React 前端 (從原版複製)
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── Dockerfile              # 多階段構建
└── README.md
```

## 🔌 API 端點

所有 API 端點保持與原 Node.js 版本兼容：

### 連線管理
- `GET /api/connections` - 取得連線列表
- `POST /api/connections/invitation` - 創建邀請
- `POST /api/connections/accept` - 接受邀請
- `DELETE /api/connections/:id` - 移除連線

### Schema 管理
- `GET /api/schemas` - 取得 Schema 列表
- `GET /api/schemas/:id` - 取得 Schema 詳情
- `POST /api/admin/schema` - 創建 Schema 和 CredDef

### Credential Definition 管理
- `GET /api/credential-definitions` - 取得 CredDef 列表
- `GET /api/credential-definitions/:id` - 取得 CredDef 詳情

### 憑證管理
- `POST /api/credentials/send` - 發送憑證
- `GET /api/credential-exchanges` - 取得交換記錄
- `POST /api/credentials/revoke` - 撤銷憑證

## ✨ 主要優勢

### 1. 型別安全

**原版本 (Node.js)**:
```javascript
const response = await httpAsync({...});
// response 型別未知，需要手動檢查
if (response.results) {
  return response.results;
}
```

**新版本 (Python)**:
```python
connections = await client.connection.get_connections()
# connections 自動有型別: ConnRecordListResponse
return {"results": [conn.to_dict() for conn in connections.results]}
```

### 2. 自動驗證

**原版本**: 需要手動檢查必填欄位
```javascript
if (!credentialObj.connection_id) {
  throw new Error('connection_id is required');
}
```

**新版本**: Pydantic 自動驗證
```python
class SendCredentialRequest(BaseModel):
    connection_id: str  # 自動必填檢查
```

### 3. 更簡潔的程式碼

- 原版本 `AgentService.js`: ~680 行
- 新版本所有 routes: ~400 行
- 減少 ~40% 程式碼量

## 🧪 測試

```bash
# 執行測試 (TODO: 補充測試)
pytest

# 型別檢查
mypy main.py routes/
```

## 📝 遷移注意事項

1. **前端不需修改**: API 接口完全兼容
2. **環境變數相同**: 使用相同的 `FABER_AGENT_HOST` 等
3. **Docker 部署相容**: 可直接替換到現有的 docker-compose

## 🔜 後續工作

- [ ] 補充單元測試
- [ ] 添加 API 文檔 (FastAPI 自動生成)
- [ ] 添加日誌記錄
- [ ] 性能優化
- [ ] 遷移 Alice Controller
- [ ] 遷移 Acme Controller

## 📚 參考資源

- [aries-cloudcontroller-python](https://github.com/didx-xyz/aries-cloudcontroller-python)
- [FastAPI 文檔](https://fastapi.tiangolo.com/)
- [ACA-Py 文檔](https://aca-py.org/)
