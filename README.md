# 市集預購系統

週末市集的跨攤商預購平台。廠商（市集營運方）建立場次與攤商邀請碼，攤商上架商品與內容物，
顧客用 LINE 登入後跨攤商下單，系統拆成各攤子單並產生每攤一組的 4 碼取貨碼，現場核銷。
**沒有線上金流。**

規格來源：`../spec/`。實作規則以 `../spec/00-執行守則.md` 為準。

---

## 環境需求

| 項目 | 版本 |
|---|---|
| Node.js | 20 以上（開發環境實測 24） |
| pnpm | 9 以上（本專案以 corepack 鎖定 12.4.1） |
| Docker | 用來跑本機 PostgreSQL 16 |

沒有 pnpm 的話：

```bash
corepack enable pnpm
```

---

## 從零啟動（本機開發）

```bash
# 1. 安裝相依套件
pnpm install

# 2. 建立 .env
cp .env.example .env
#    最少要改這兩項：
#    - JWT_SECRET：32 字元以上隨機字串
#        node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
#    - LINE_LOGIN_CHANNEL_ID / LINE_LOGIN_CHANNEL_SECRET（見下方 LINE Console 設定）

# 3. 啟動資料庫（PostgreSQL 16，對外 5433 埠）
pnpm db:up

# 4. 建立資料表
pnpm db:migrate

# 5. 匯入開發用假資料
pnpm db:seed

# 6. 啟動 API（:3000）與前端（:5173）
pnpm dev
```

打開 <http://localhost:5173> 應該看到 seed 的場次卡片。

> `pnpm dev` 的前端會把 `/api/*` proxy 到 `localhost:3000`，因此瀏覽器端是同源，
> session cookie 不需要跨站設定。

### 手機實機測試

Vite 已開 `host: true`，同一個 Wi-Fi 下用電腦的區網 IP 開 `http://<你的IP>:5173` 即可。
LINE 登入需要 callback 走得通，請把 `WEB_URL` 與 `LINE_LOGIN_CALLBACK_URL` 換成該網址
（或使用 ngrok 之類的通道），並同步更新 LINE Console 的 Callback URL。

---

## 常用指令

| 指令 | 說明 |
|---|---|
| `pnpm dev` | 同時啟動 API 與前端 |
| `pnpm build` | 產出 `apps/api/dist` 與 `apps/web/dist` |
| `pnpm typecheck` | 全 workspace 型別檢查 |
| `pnpm lint` | ESLint |
| `pnpm test` | API 測試（vitest + supertest，跑在測試資料庫上） |
| `pnpm db:up` / `pnpm db:down` | 啟動／停止本機 PostgreSQL |
| `pnpm db:migrate` | 套用 migration（`prisma migrate deploy`） |
| `pnpm db:migrate:dev` | 開發時新增 migration |
| `pnpm db:seed` | 匯入開發假資料（可重複執行） |
| `pnpm db:reset` | **刪掉資料庫 volume** 後重建（資料全失） |
| `pnpm db:studio` | 開 Prisma Studio 看資料 |

### 重置資料

```bash
pnpm db:reset      # 砍掉 volume 重建容器
pnpm db:migrate
pnpm db:seed
```

---

## 測試

測試跑在獨立的 `market_preorder_test` 資料庫（`docker/initdb/01-create-test-db.sql` 建立），
每個測試前會清空資料表，因此 `TEST_DATABASE_URL` **絕對不能**指向開發資料庫，程式會擋下來。

```bash
pnpm db:up     # 資料庫要先起來
pnpm test
```

---

## LINE Developers Console 設定

> ⚠️ **LINE Login channel 與 Messaging API channel 必須建立在同一個 Provider 底下。**
> 不同 Provider 取得的 `userId` 不同且**無法搬遷**，事後只能重做，所有攤商與顧客綁定都會失效。
> 這是 LINE 平台限制，不是本系統的設計選擇。

1. 到 <https://developers.line.biz/console/> 建立（或選擇）一個 **Provider**。
2. 在該 Provider 下建立 **LINE Login channel**：
   - `Channel ID` → `.env` 的 `LINE_LOGIN_CHANNEL_ID`
   - `Channel secret` → `.env` 的 `LINE_LOGIN_CHANNEL_SECRET`
   - **LINE Login 分頁 → Callback URL** 填入與 `.env` 的 `LINE_LOGIN_CALLBACK_URL` **完全一致**的網址，
     本機預設為 `http://localhost:3000/api/auth/line/callback`
   - `OpenID Connect` 需啟用（本系統用 ID token 在伺服器端驗證身分）
3. 在**同一個 Provider** 下建立 **Messaging API channel**（Sprint 5 才會用到）：
   - `Channel secret` → `LINE_MESSAGING_CHANNEL_SECRET`
   - 發行 `Channel access token` → `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`
4. LIFF app（Sprint 5 才會用到）：在 LINE Login channel 下新增，`LIFF ID` → `LIFF_ID`。

### 把自己設成廠商（operator）

攤商透過邀請碼綁定，廠商則需直接改資料庫。先用 LINE 登入一次，然後：

```bash
docker exec -it market-preorder-db psql -U market -d market_preorder \
  -c "UPDATE app_user SET role = 'operator' WHERE line_user_id = 'U你的LINEuserId';"
```

（`line_user_id` 可用 `pnpm db:studio` 查，或看 `app_user` 表最新一筆。）

---

## 環境變數

完整清單見 [`.env.example`](.env.example)。Sprint 0 只需要下列項目即可啟動：

| 變數 | 說明 |
|---|---|
| `DATABASE_URL` | 開發資料庫連線字串 |
| `TEST_DATABASE_URL` | 測試資料庫連線字串（不可與上者相同） |
| `JWT_SECRET` | 自簽 session JWT 的密鑰，32 字元以上 |
| `WEB_URL` | 前端對外網址，LINE 登入完成後導回這裡 |
| `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` | LINE Login channel |
| `LINE_LOGIN_CALLBACK_URL` | 必須與 LINE Console 設定一致 |

---

## 專案結構

```
market-preorder/
├── apps/
│   ├── api/                 Fastify 後端
│   │   ├── src/
│   │   │   ├── modules/     每個領域一個資料夾（auth, market, stall, product, order, broadcast, line）
│   │   │   ├── plugins/     auth 驗證、錯誤處理（socket.io 於 Sprint 4）
│   │   │   ├── lib/         db、jwt、line、time
│   │   │   └── server.ts
│   │   ├── prisma/          schema.prisma、migrations、seed.ts
│   │   └── tests/
│   └── web/                 React 前端（顧客／攤商／廠商三個 view 用路由分）
│       └── src/
│           ├── routes/      customer/  stall/  operator/
│           ├── components/
│           ├── api/         fetch 封裝
│           └── store/
├── packages/
│   └── shared/              zod schema、共用型別、狀態列舉、錯誤碼
├── docker-compose.yml       本機 PostgreSQL
└── .env.example
```

三個 view 都在同一個前端 app，用路由前綴區分：

| 路由 | 對象 |
|---|---|
| `/` | 顧客 |
| `/stall` | 攤商 |
| `/operator` | 廠商（市集營運方） |

---

## 資料庫

- Prisma schema：`apps/api/prisma/schema.prisma`，與 `../spec/schema.sql` 對齊。
- Prisma 無法宣告的 **CHECK 約束**與 **partial unique index**，寫在
  `apps/api/prisma/migrations/20260912000000_init/migration.sql` 尾端的手寫區塊。
  重新產生 migration 時**必須保留這一段**。
- 金額一律整數「元」（TWD），不使用浮點數。
- 時間一律存 `timestamptz`（UTC），顯示時轉 `Asia/Taipei`；
  `market_day.event_date` 是 `date`，代表台北當地日期。

---

## 部署

需要能跑 Node 長駐程序的平台（Sprint 4 起會用 socket.io，不能是純 serverless），
加上一個 PostgreSQL 15+。

1. 建立 PostgreSQL（Neon、平台內建 Postgres 皆可），取得連線字串。
2. 部署 API（`apps/api`）：
   - Build：`pnpm install && pnpm --filter @market/api build`
   - Start：`pnpm --filter @market/api start`
   - 環境變數：照 `.env.example`，`NODE_ENV=production`、`COOKIE_SECURE=true`
   - 首次部署後執行 `pnpm --filter @market/api db:migrate`
3. 部署前端（`apps/web`）：
   - Build：`pnpm install && pnpm --filter @market/web build`
   - 輸出：`apps/web/dist`（靜態檔）
   - 設 `VITE_API_BASE_URL` 指向 API 網址，或在同網域下用反向代理把 `/api` 導到 API
4. 把正式網址填回 `WEB_URL`、`LINE_LOGIN_CALLBACK_URL`，並更新 LINE Console 的 Callback URL。

> 前後端不同網域時，session cookie 是 `SameSite=Lax`，跨站不會送出。
> 請把兩者放在同一個網域（用反向代理），這是預設且經過驗證的部署方式。

---

## 開發進度

依 `../spec/06-迭代計畫.md` 逐 Sprint 進行，每個 Sprint 的驗收結果記在 [`NOTES.md`](NOTES.md)。

- [x] Sprint 0：骨架（LINE 登入、場次列表、權限函式、測試骨架）
- [ ] Sprint 1：廠商 CMS（市集、場次、攤商、邀請碼）
- [ ] Sprint 2：商品、內容物、圖片、本場上架
- [ ] Sprint 3：購物車、下單、拆單、取貨碼
- [ ] Sprint 4：攤商訂單、即時推送、備貨總表、核銷
- [ ] Sprint 5：LINE Bot 與系統通知
- [ ] Sprint 6：推播申請與審核
- [ ] Sprint 7：硬化與交付
