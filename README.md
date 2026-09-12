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

### 手機實機測試（區網）

Vite 已開 `host: true`，同一個 Wi-Fi 下用電腦的區網 IP 開 `http://<你的IP>:5173` 即可瀏覽。
但 LINE 登入需要 HTTPS 的公開 callback，區網 IP 不行，要用下面的 ngrok。

---

## 用 ngrok 開公開網址（LINE 登入必備）

LINE Login 的 Callback URL 必須是外部連得到的 HTTPS 網址，本機 `localhost` 不行。
開發階段用 ngrok 開一條通道即可。

```bash
# 前置：安裝 ngrok 並設定 authtoken（只要做一次）
#   https://dashboard.ngrok.com/get-started/your-authtoken
ngrok config add-authtoken <你的 token>
```

啟動順序（三個終端機，或讓前兩個在背景跑）：

```bash
pnpm db:up      # 1. 資料庫
pnpm tunnel     # 2. 開通道；會印出公開網址，並自動寫回 .env
pnpm dev        # 3. 啟動 API 與前端（一定要在 tunnel 之後，才會讀到新的 .env）
```

`pnpm tunnel` 做的事：

- `ngrok http 5173` 開一條通道到**前端**。
  為什麼是前端：`pnpm dev` 的 Vite 會把 `/api/*` proxy 到 `:3000`，
  所以一條通道就能同時服務網頁與 API，兩者同源，
  session cookie（`SameSite=Lax`）不需要任何跨站設定。
- 自動把網址寫回 `.env` 的 `WEB_URL`、`LINE_LOGIN_CALLBACK_URL`，
  並把 `COOKIE_SECURE` 設成 `true`（通道是 HTTPS）。

然後到 **LINE Console → LINE Login → Callback URL** 貼上腳本印出的那行
（`https://xxxx.ngrok-free.app/api/auth/line/callback`），手機開公開網址就能登入。

### ngrok 免費方案的兩個坑

1. **每次重開 `pnpm tunnel`，網址都會變。**
   `.env` 會自動更新，但你必須：重跑 `pnpm dev`、並回 LINE Console 換掉 Callback URL。
   受不了的話就升級 ngrok 付費版用固定網域，或直接部署到正式環境。
2. **第一次進站會有一頁 ngrok 警告**（`ERR_NGROK_6024`），按「Visit Site」即可，
   之後 ngrok 會種 cookie 不再顯示。
   這頁警告連 `fetch('/api/...')` 也會攔（回 HTML 而不是 JSON），
   因此 `apps/web/src/api/client.ts` 在 ngrok 網域下會自動帶
   `ngrok-skip-browser-warning` header —— 這是 ngrok 官方的 bypass 方式，
   只在 ngrok 網域生效，正式部署完全不受影響。

### 改回純本機（不用 ngrok）

把 `.env` 改回：

```
WEB_URL=http://localhost:5173
LINE_LOGIN_CALLBACK_URL=http://localhost:3000/api/auth/line/callback
COOKIE_SECURE=false
```

`COOKIE_SECURE=false` 是關鍵 —— 設成 `true` 時 cookie 只會在 HTTPS 下送出，
用 `http://localhost` 會一直登不進去。

---

## 常用指令

| 指令 | 說明 |
|---|---|
| `pnpm dev` | 同時啟動 API 與前端 |
| `pnpm tunnel` | 開 ngrok 通道到公開網址，並把網址寫回 `.env`（LINE 登入用） |
| `pnpm build` | 產出 `apps/api/dist` 與 `apps/web/dist` |
| `pnpm typecheck` | 全 workspace 型別檢查 |
| `pnpm lint` | ESLint |
| `pnpm test` | API 測試（vitest + supertest，跑在測試資料庫上） |
| `pnpm db:up` / `pnpm db:down` | 啟動／停止本機 PostgreSQL |
| `pnpm db:migrate` | 套用 migration（`prisma migrate deploy`） |
| `pnpm db:migrate:dev` | 開發時新增 migration |
| `pnpm db:seed` | 匯入開發假資料（可重複執行，對應 spec/schema.sql 的 Seed 段） |
| `pnpm db:seed:demo` | 匯入**展示測資**：5 攤商、10 商品、三種狀態場次、10 組邀請碼 |
| `pnpm line:richmenu` | 建立 LINE 圖文選單（需先設定 Messaging API） |
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
   - **LINE Login 分頁 → Callback URL** 填入與 `.env` 的 `LINE_LOGIN_CALLBACK_URL` **完全一致**的網址。
     用 ngrok 時就是 `pnpm tunnel` 印出的那行
     （`https://xxxx.ngrok-free.app/api/auth/line/callback`）；
     **`localhost` 不會被 LINE 接受**
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

完整清單與註解見 [`.env.example`](.env.example)。

**基本（沒有就起不來）**

| 變數 | 說明 |
|---|---|
| `DATABASE_URL` | 開發資料庫連線字串 |
| `TEST_DATABASE_URL` | 測試資料庫連線字串，**不可與上者相同**（測試會清空資料） |
| `JWT_SECRET` | 自簽 session JWT 的密鑰，32 字元以上 |
| `WEB_URL` | 前端對外網址；LINE 登入完成後導回這裡，推播按鈕也用它 |
| `COOKIE_SECURE` | HTTPS 環境設 `true`；純 `http://localhost` 必須是 `false` |

**LINE 登入（顧客與攤商登入必需）**

| 變數 | 說明 |
|---|---|
| `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` | LINE Login channel |
| `LINE_LOGIN_CALLBACK_URL` | 必須與 LINE Console 設定**完全一致** |

**LINE 推播（新訂單通知、取貨提醒、推播功能）**

| 變數 | 說明 |
|---|---|
| `LINE_MESSAGING_CHANNEL_SECRET` | webhook 簽章驗證用 |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | 送訊息用 |
| `LIFF_ID` | LINE 內建瀏覽器免重複登入 |
| `LINE_MONTHLY_MESSAGE_QUOTA` | LINE quota API 取不到時的月額度上限（預設 200） |
| `PICKUP_REMINDER_HOUR` | 當日取貨提醒的時間，台北整點（預設 8） |

**圖片儲存**

| 變數 | 說明 |
|---|---|
| `STORAGE_DRIVER` | `local`（預設，存本機）或 `s3`（**尚未實作**，見 NOTES） |
| `UPLOAD_DIR` | `local` 時的存放目錄 |

**⚠️ 規格外的暫時設定**（見 [`NOTES.md`](NOTES.md) 的說明與移除方式）

| 變數 | 說明 |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | 暫時的 Google 登入通道 |
| `ENABLE_IMPERSONATION` | 廠商後台的身分模擬。**正式環境請保持 `false`** |

---

## 專案結構

```
market-preorder/
├── apps/
│   ├── api/                 Fastify 後端
│   │   ├── src/
│   │   │   ├── modules/     每個領域一個資料夾（auth, market, stall, product, order, broadcast, line）
│   │   │   ├── plugins/     auth、authz、錯誤處理、socket.io
│   │   │   ├── lib/         db、jwt、line/（client・sender・messages）、image、
│   │   │   │                pickupCode、inviteCode、events、time
│   │   │   ├── jobs/        inviteExpire、inviteRecycle、pickupReminder
│   │   │   └── server.ts
│   │   ├── prisma/          schema.prisma、migrations、seed.ts、seed-demo.ts
│   │   ├── scripts/         richmenu.ts
│   │   └── tests/           14 個測試檔，159 測項
│   └── web/                 React 前端（顧客／攤商／廠商三個 view 用路由分）
│       └── src/
│           ├── routes/      customer/  stall/  operator/
│           ├── components/
│           ├── api/         fetch 封裝
│           └── store/
├── packages/
│   └── shared/              zod schema、共用型別、狀態列舉、錯誤碼
├── docs/                    三份操作說明（顧客／攤商／廠商）
├── scripts/tunnel.mjs       ngrok 通道 + 自動寫回 .env
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

## 給使用者的操作說明

非工程師看這三份就夠了：

- [顧客操作說明](docs/操作說明-顧客.md)
- [攤商操作說明](docs/操作說明-攤商.md)
- [廠商操作說明](docs/操作說明-廠商.md)

---

## 開發進度

依 `../spec/06-迭代計畫.md` 逐 Sprint 進行，每個 Sprint 的驗收結果記在 [`NOTES.md`](NOTES.md)。

- [x] Sprint 0：骨架（LINE 登入、場次列表、權限函式、測試骨架）
- [x] Sprint 1：廠商 CMS（市集、場次、攤商、邀請碼）
- [x] Sprint 2：商品、內容物、圖片、本場上架
- [x] Sprint 3：購物車、下單、拆單、取貨碼
- [x] Sprint 4：攤商訂單、即時推送、備貨總表、核銷
- [x] Sprint 5：LINE Bot 與系統通知
- [x] Sprint 6：推播申請與審核
- [x] Sprint 7：硬化與交付（**手動驗收項目待委託方執行**，見 NOTES.md）

`05-畫面規格.md` 的 27 個畫面全部實作完成；自動測試 159 項全綠。
