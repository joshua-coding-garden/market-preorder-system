# NOTES

每個 Sprint 的完成項目、驗收結果、已知問題與建議。
建議（不實作）依 `00-執行守則.md` B-9 一律記在這裡，不擴大當期範圍。

---

## Sprint 0｜骨架（Walking Skeleton）

日期：2026-09-12

### 完成項目

- **Monorepo**：pnpm workspaces（`apps/api`、`apps/web`、`packages/shared`），
  TypeScript strict，ESLint flat config，結構照 `00 §A`。
- **資料庫**：`docker-compose.yml` 起 PostgreSQL 16（對外 5433 埠），
  另建測試資料庫 `market_preorder_test`。
- **Prisma**：`schema.prisma` 對齊 `spec/schema.sql` **全部 19 張表**；
  migration 尾端補上 Prisma 無法宣告的 **20 條 CHECK 約束**與
  **2 個 partial unique index**（`uq_invite_code_live`、`uq_invite_code_active`）。
- **Seed**：`prisma/seed.ts` 對應 `schema.sql` 的 Seed 段（1 市集、1 場次、2 攤商、
  2 參與、2 邀請碼、3 商品、3 內容物、3 listing），可重複執行。
- **packages/shared**：狀態列舉（02 §C）、錯誤碼與 HTTP 對照（03 §12）、
  zod 共用 primitive（電話、HH:mm、15 分倍數、市集代號、商品代碼、邀請碼、取貨碼、金額）、
  Sprint 0 的 request schema 與回應型別。
- **API**：
  - `GET /api/auth/line/start`、`GET /api/auth/line/callback`（含 state/nonce 驗證、
    **伺服器端驗 ID token**、upsert `app_user`、簽自家 JWT 寫入 httpOnly cookie）
  - `POST /api/auth/logout`、`GET /api/me`（回 `capabilities`）
  - `GET /api/market-days`、`GET /api/market-days/:id`
  - `GET /api/operator/markets`（S0-4 驗收需要）
  - `GET /api/health`
- **權限函式（04 §H 完整實作）**：`requireAuth`、`assertOperator`、`assertStallMember`、
  `assertPreorderOwner`、`managedStallIds`。每支 route 檔案頂端以註解標明用到哪些 assert。
- **Web**：三個 view 的 layout 與路由骨架（`/`、`/stall`、`/operator`）、
  前端路由守門 `RequireCapability`、C9 登入、C1 場次列表（讀真資料）、
  zh-TW 錯誤文案表、共用元件（MoneyTWD、台北時區格式化、載入／空資料／錯誤三態）。
- **測試**：`tests/auth.test.ts`（9 個測項），跑在獨立測試資料庫上，
  `globalSetup` 自動套 migration，每測項前清空資料表。

### 驗收結果（07 §S0）

| # | 項目 | 結果 |
|---|---|---|
| S0-1 [manual] | `pnpm install && pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm dev` | ✅ 兩個服務都起來，無錯誤。API `:3000` 回 `/api/health` 200，Web `:5173` 回 200，`/api/market-days` 經 Vite proxy 取得 seed 場次 |
| S0-2 [manual] | 手機開部署網址 → LINE 登入 → 看到 seed 場次卡片 | 🟡 **一半完成**。對外網址已用 ngrok 打通，C1／C9 從公開網址渲染正常（見下方「ngrok 公開網址」）；**LINE 登入本身仍未驗證**，缺 LINE channel 憑證 |
| S0-3 [auto] | 無 cookie `GET /api/me` → 401 | ✅ 回 `{ error: 'UNAUTHENTICATED' }` |
| S0-4 [auto] | role=user `GET /api/operator/markets` → 403，body 無資料 | ✅ 回 `{ error: 'FORBIDDEN' }`，另驗證 body 不含市集名稱；operator 同端點回 200 |
| S0-5 [auto] | 偽造 JWT（錯簽章）`GET /api/me` → 401 | ✅ 另測非 JWT 格式的 cookie 也回 401 |
| S0-6 [auto] | `GET /api/market-days` 只回 PUBLISHED | ✅ DRAFT 與 CLOSED 都不在列表；另驗 DRAFT 詳情對顧客 404、對 operator 200 |

`pnpm typecheck` ✅ 無錯誤　`pnpm lint` ✅ 無錯誤　`pnpm test` ✅ 9/9 通過　`pnpm build` ✅ 前後端皆成功

### ngrok 公開網址（Sprint 0 追加）

LINE Login 的 Callback URL 必須是外部連得到的 HTTPS 網址，`localhost` 不被 LINE 接受。
因此開發階段用 ngrok 開通道，正式部署前都用這個方式驗證。

- 新增 `pnpm tunnel`（`scripts/tunnel.mjs`）：開 `ngrok http 5173`，
  取得公開網址後**自動寫回 `.env`** 的 `WEB_URL`、`LINE_LOGIN_CALLBACK_URL`，
  並把 `COOKIE_SECURE` 設為 `true`。
- **通道開在前端而不是 API**：`pnpm dev` 的 Vite 會把 `/api/*` proxy 到 `:3000`，
  一條通道就同時服務網頁與 API，兩者同源，`SameSite=Lax` 的 session cookie
  不需要任何跨站設定。開兩條通道反而要處理跨站 cookie，複雜且脆弱。
- `apps/web/vite.config.ts` 加上 `allowedHosts`（`.ngrok-free.app` 等），
  否則 Vite 6 會擋掉未知的 Host header。

**驗證結果**（公開網址 `https://f0e2-140-133-67-3.ngrok-free.app`）：

| 項目 | 結果 |
|---|---|
| 公開網址載入 C1 場次列表 | ✅ 以 375×812（規格基準）手機 viewport 實測：`scrollWidth === innerWidth === 375`、無任何元素超出視窗（無橫向捲動）；內容顯示「2026年9月15日週二／運動中心週末市集／09:00–15:00／2 攤／還有 2 天可預購」 |
| 公開網址載入 C9 登入頁 | ✅ 文案與「使用 LINE 登入」按鈕正常 |
| 經通道呼叫 `/api/market-days` | ✅ 回 seed 場次 JSON |
| 經通道呼叫 `/api/me`（未登入） | ✅ 401 `UNAUTHENTICATED` |
| 經通道呼叫 `/api/auth/line/start` | ✅ 409 並明確指出缺 LINE channel 設定（非 500） |
| 手機實機開啟 | ⬜ 待委託方執行 |
| LINE 登入完整流程 | ⬜ 待 LINE channel 憑證 |

**踩到的坑（已處理）**：ngrok 免費方案會對所有「像瀏覽器」的請求插入一頁警告
（`ERR_NGROK_6024`），**連 `fetch('/api/...')` 也會被攔**，拿到 HTML 而不是 JSON，
`JSON.parse` 直接炸掉。處理方式是 `apps/web/src/api/client.ts` 在 ngrok 網域下
自動帶 `ngrok-skip-browser-warning` header（ngrok 官方 bypass 方式），
只在 ngrok 網域生效，正式部署不受影響。網址列直接輸入或 LINE 轉址進站時
仍會看到那頁警告，按一次「Visit Site」即可，之後 ngrok 會種 cookie。

### 已知問題與未完成項

1. **LINE 登入仍未端到端驗證**：缺 LINE channel 憑證（`LINE_LOGIN_CHANNEL_ID`／
   `LINE_LOGIN_CHANNEL_SECRET`）。程式路徑已完成並可從公開網址觸達
   （`/auth/line/start` → LINE → callback → 驗 ID token → 簽 session → 導回 `/`），
   憑證填上、LINE Console 的 Callback URL 對上就能驗。
   **正式部署平台也尚未決定**，ngrok 是開發期的替代方案，不是交付狀態。
2. **ngrok 免費方案每次重開網址都會變**：必須重跑 `pnpm dev` 並回 LINE Console
   更新 Callback URL。頻繁測試 LINE 登入時建議升級 ngrok 付費固定網域，
   或提早把 Sprint 0 的「部署到真網址」補完。
3. **`GET /operator/markets` 只實作了 GET**：S0-4 驗收需要這支端點存在才能驗 403。
   `POST /operator/markets` 等其餘廠商 API 屬 Sprint 1 範圍，未實作。
4. **pnpm 版本**：本機 corepack 取得的是 pnpm 12.4.1，已寫進 `packageManager`。
   pnpm 10 之後預設封鎖相依套件的 build script，因此 `pnpm-workspace.yaml` 內有
   `allowBuilds`（Prisma query engine 與 esbuild 原生 binary 需要），已納入版控，
   第三人 clean install 不會再被詢問。
5. **Windows 上跑 `pnpm build` 前要先停掉 `pnpm dev`**：
   dev server 佔住 Prisma query engine DLL，`prisma generate` 會 EPERM。
   非 Windows 環境沒有這個問題。

### Non-goals 確認（00 §C）

本 Sprint 未觸及、且全期都不做：線上金流／退款／發票、簡訊 OTP、攤商自助註冊、
顧客自行取消訂單、庫存進銷存、多語系、原生 App、Email 通知、多層巢狀內容物。

### 建議（不實作，待委託方決定）

1. **`POST /orders` 的併發上限檢查**（S3-11）需要 `SELECT ... FOR UPDATE`。
   目前 Prisma 的 `$transaction` 預設隔離等級是 Read Committed，
   Sprint 3 實作時建議用 `$queryRaw` 明確鎖 listing 列，不要靠 Prisma 的樂觀更新。
2. **`market_day.status` 的 CLOSED 唯讀規則**散落在多個模組，
   建議 Sprint 1 就把 `assertMarketDayWritable(dayId)` 放進 `modules/market/service.ts`，
   後續 Sprint 直接沿用，避免每支端點各寫一次。
3. **取貨碼碰撞重試**：`UNIQUE(market_day_id, pickup_code)` 搭配 4 碼字元集（31^4 ≈ 92 萬組），
   單場次訂單量遠低於此，建議 Sprint 3 用「產碼 → 插入 → 撞到就重試」而非事先查詢，
   可省一次查詢且天然免除競態。
4. **前端 API 呼叫目前是手寫 `useEffect` + `useState`**。
   等 Sprint 3 畫面變多時，若覺得重複，可考慮引入 TanStack Query；
   但這會增加一個相依套件，**不在規格內，需委託方同意**。
5. **`.env` 的 `TZ=Asia/Taipei`**：目前時間換算全部在程式內用固定 UTC+8 處理
   （`lib/time.ts`），不依賴行程時區，因此換到任何時區的機器都正確。
   `TZ` 只影響 log 顯示。
