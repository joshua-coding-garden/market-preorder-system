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

---

## Sprint 1｜廠商 CMS：市集、場次、攤商、邀請碼

日期：2026-09-12

### 完成項目

- **API §2 operator 全部**：`GET/POST /operator/markets`、`GET/POST /operator/market-days`、
  `PATCH /operator/market-days/:id`、`publish`／`unpublish`／`close`。
- **API §3 全部**：`GET/POST /operator/stalls`、`PATCH /operator/stalls/:id`、
  參與的 CRUD（建立時自動產碼）、`invite-codes/reissue`、`POST /stall/invite-codes/redeem`、
  `GET /stalls/:stallId/market-days`。
- **場次狀態機（04 §A）**：`DRAFT → PUBLISHED → CLOSED`；close 的三個副作用
  （PENDING 子單轉 NO_SHOW、`closed_at`、該場 ACTIVE 邀請碼轉 EXPIRED）都在同一個交易內。
  另抽出 `assertMarketDayWritable()`，CLOSED 後所有寫入端點一律 409（Sprint 0 NOTES 的建議 2 已落實）。
- **邀請碼（D-03 / 04 §C）**：`lib/inviteCode.ts` 負責產碼、流水號、撞碼重試（最多 20 次）。
  流水號取「該場次尚未回收的最大流水號 + 1」，因此回收後字串可以重新配發。
- **排程（04 §G）**：`inviteExpire`（每小時）、`inviteRecycle`（每天 03:00 台北），
  以 node-cron 在 `server.ts` 啟動，job 本身是純函式可獨立測試。
- **畫面**：O2 市集、O3 場次列表（狀態 tab + 新增）、O4 場次詳情（參與攤商表、邀請碼複製／重發／移除、
  發布／取消發布／結案）、O5 攤商管理、S1 攤商首頁、S2 邀請碼綁定。

### 驗收結果（07 §S1）

| # | 項目 | 結果 |
|---|---|---|
| S1-1 | 新增市集 `code=B`；`code=b` 被拒 | ✅ `[auto]` 小寫回 400 VALIDATION、大寫回 201、重複回 409 |
| S1-2 | 新增場次 → DRAFT，顧客端看不到 | ✅ `[auto]` DRAFT 不在 `/market-days`；`[manual]` O3 建立後狀態為未發布 |
| S1-3 | 加入攤商 → 邀請碼 `B{YYYYMMDD}-0001` | ✅ `[auto]` 格式、`expires_at`（當天 23:59:59 台北）、`recyclable_at`（+60 天）全部驗證 |
| S1-4 | 攤位重複 409；改攤位成功且碼為 `-0002` | ✅ `[auto]` |
| S1-5 | 兌換 → 200、`stall_member` +1、碼 REDEEMED | ✅ `[auto]` 另驗 `/me` 的 `capabilities.stall` 由 false 變 true |
| S1-6 | 同一碼再兌換 → 400 `INVITE_INVALID` | ✅ `[auto]` 另驗回應不洩漏攤商名稱 |
| S1-7 | EXPIRED 的碼 → 訊息與 S1-6 完全相同 | ✅ `[auto]` 三種失敗情況訊息皆為「邀請碼無效或已使用」 |
| S1-8 | `inviteExpire` job | ✅ `[auto]` 含冪等測試 |
| S1-9 | `inviteRecycle` 後 reissue 產出相同字串 | ✅ `[auto]` 驗證兩筆同字串並存且只有一筆非 RECYCLED |
| S1-10 | 無 participation 不能發布 | ✅ `[auto]` 400；加一攤後發布成功且 C1 出現 |
| S1-11 | 有 preorder 時 unpublish → 409 | ✅ `[auto]` |
| S1-12 | 攤商登入 → S1 看到攤商與場次 | ✅ `[manual]` 以模擬身分驗過；真 LINE 帳號待憑證 |

`pnpm typecheck` ✅　`pnpm lint` ✅　`pnpm test` ✅ 32/32（`auth` 9 + `invite` 23）

### 展示測資（`pnpm db:seed:demo`）

規格的 `pnpm db:seed` 嚴格對應 `schema.sql` 的 Seed 段，不能擴充；
另外加了一支 `pnpm db:seed:demo` 疊上實際能點的測資，可重複執行：

- 5 家攤商、10 項商品（含內容物與加價）
- 三種狀態的場次各一：本週 PUBLISHED（5 攤、可下單）、下週 DRAFT（3 攤、顧客看不到）、
  上週 CLOSED（2 攤、唯讀）
- 邀請碼共 10 組，執行後直接印在終端機

### ⚠️ 規格外的追加（委託方 2026-09-12 口頭指示）

以下三項**不在 spec 內**，是委託方在 Sprint 1 進行中要求的。全部標成可拔除：

1. **Google 第三方登入**（`/auth/google/*`）
   - 原因：LINE channel 憑證尚未取得，需要能先登入測試。
   - 做法：Google 帳號以 `google:{sub}` 寫進 `app_user.line_user_id`，不改資料表。
     ID token 用 Google JWKS 在伺服器端驗證（含 aud／iss／nonce）。
   - **限制**：這種帳號**收不到 LINE 推播**（Sprint 5 的 sender 會跳過）。
     正式身分來源仍是 LINE Login（D-11）。
   - 移除方式：刪掉 `lib/googleLogin.ts`、`/auth/google/*` 兩支 route、
     `service.ts` 的 `upsertUserFromGoogle`、C9 的 Google 按鈕，並清掉 `.env` 三個變數。
2. **帳號與權限頁**（`/operator/permissions`，API `/operator/accounts*`）
   - 規格 D-01 沒有第四種角色，因此**不新增 role 列舉**，直接把 `operator` 當系統管理身分。
   - 安全規則：不能更改自己的權限；系統一定保留至少一位管理員。
   - 權限判斷每次重查資料庫（B-1），所以改權限對既有 session 立即生效。
3. **身分模擬**（`/operator/impersonation`）
   - 換發 session JWT（帶 `imp` claim 記住原管理員），**權限是真的降級**，
     所有 `assert*` 照常在後端生效 —— 不是前端隱藏按鈕。已實測：
     模擬一般使用者時打 `/operator/accounts` 回 **403**，結束模擬後回 200。
   - 可模擬「未登入的訪客」：清掉 session，還原資訊留在獨立的 `mp_impersonator` cookie。
   - **以 `ENABLE_IMPERSONATION` 控制，預設 false，正式環境請勿開啟。**

這三項讓「新增的 API 都在 03-API契約.md 有對應」這條 DoD 不再成立。
若要回到純規格狀態，照上面的移除方式處理即可。

### 建議（不實作）

1. O4 的結案確認框目前只顯示固定文字。要顯示「將轉為未取的筆數」需要 §9 的
   `GET /operator/market-days/:id/sub-orders?status=PENDING`，該端點在 Sprint 4，屆時再接上。
2. `invite_code` 的流水號目前每次都掃該場次全部未回收的碼。單場攤商數量在數十以內沒有問題，
   若未來一場上百攤，改成在 `market_day` 上放一個 counter 欄位會更省。

---

## Sprint 2｜商品、內容物、圖片、本場上架

日期：2026-09-12

### 完成項目

- **API §4**：`GET/POST /stalls/:stallId/products`、`PATCH`／`DELETE`（軟刪）、
  `PUT .../components`（整組取代，未列出的舊 id 轉 `is_active=false` 而非刪除，
  因為 `order_item_component.component_id` 要能追溯）、`POST .../image`。
- **API §5**：`GET/PUT /stalls/:stallId/market-days/:dayId/listings`、`copy-from`；
  以及顧客端的 `GET /market-days/:id/listings`（schema.sql Q1）。
- **圖片管線（04 §F、B-12）**：`lib/image.ts` 用 sharp `rotate()`（依 EXIF）→ resize inside →
  WebP。主圖最長邊 1200 q80、縮圖 400 q75；原始檔不落地，舊圖在新圖寫入成功後才刪。
  `STORAGE_DRIVER=local` 由 `@fastify/static` 提供 `/uploads/*`。
- **畫面**：S3 商品管理、S4 商品編輯（ImageUploader + 內容物可增刪排序）、S5 本場上架
  （勾選、售價、上限、狀態、沿用上一場）、C2 場次頁（攤商 chips、搜尋、商品格狀列表）、
  C3 攤商頁、C4 商品詳情（本 Sprint 為唯讀，Sprint 3 再加購物車）。

### 驗收結果（07 §S2）

| # | 項目 | 結果 |
|---|---|---|
| S2-1 | 新增商品含兩個內容物 | ✅ `[auto]` 建立時可一併帶 components；S3 顯示內容物數 |
| S2-2 | 同攤重複代碼 → 409 `PRODUCT_CODE_DUPLICATE` | ✅ `[auto]` 另驗不同攤可用相同代碼 |
| S2-3 | 4000×3000 JPG → 主圖 1200 WebP、縮圖 400 WebP | ✅ `[auto]` 把檔案抓回來用 sharp 驗實際尺寸（1200×900）與格式；另驗小圖不放大 |
| S2-4 | 9MB 檔 → 400 `IMAGE_TOO_LARGE` | ✅ `[auto]` |
| S2-5 | `.gif` → 400 `IMAGE_TYPE_UNSUPPORTED` | ✅ `[auto]` 另驗別攤上傳回 403 |
| S2-6 | 上架後顧客端看得到、價格正確 | ✅ `[auto]` 顧客端回傳 price 為本場售價、含攤商名與攤位號 |
| S2-7 | `copy-from` → `{ copied: 2, skipped: 1 }` | ✅ `[auto]` 另驗已存在者不被來源價格覆蓋 |
| S2-8 | 攤商 A 讀 B 的商品 → 403 | ✅ `[auto]` body 不含 B 的商品名；另驗 A 不能建商品到 B、operator 可代操作 |
| S2-9 | CLOSED 場次 `PUT listings` → 409 | ✅ `[auto]` 另驗 `copy-from` 到已結案場次也 409 |
| S2-10 | `OFF_SHELF` 顧客看不到、`SOLD_OUT` 看得到並標售完 | ✅ `[auto]` 另驗停用商品與 DRAFT 場次都看不到 |

`pnpm typecheck` ✅　`pnpm lint` ✅　`pnpm test` ✅ 55/55
（auth 9 + invite 23 + product 8 + image 6 + listing 9）

### 已知問題

1. **`STORAGE_DRIVER=s3` 尚未實作**（D-12）。目前設成 `s3` 會直接丟出明確錯誤，
   而不是靜默寫到本機。正式部署前需要補上 S3 client，或確認部署平台有持久化磁碟。
2. **`PUT listings` 會把沒列出的商品轉成 `OFF_SHELF`**。這是「整組 upsert」的合理解讀，
   S5 畫面每次都送出完整清單所以沒問題；若之後有其他呼叫端要注意。

---

## Sprint 3｜顧客購物車、下單、拆單、取貨碼（核心）

日期：2026-09-12

### 完成項目

- **API §6 購物車**：`GET/DELETE /cart`、`POST /cart/items`、`PATCH/DELETE /cart/items/:id`。
  同 listing + 相同內容物組合（含備註）累加數量，否則新增一列（D-05）；
  `qty=0` 等同刪除；內容物 id 一律在後端驗證屬於該商品且仍啟用。
- **API §7 下單**：`POST /orders` 完全照 03 §7 的九個步驟實作，全部在單一交易內。
  - `idempotencyKey` 已存在 → 直接回該筆（200），且非本人回 403
  - `SELECT ... FOR UPDATE` 鎖 listing，**依 id 排序取鎖避免死結**
  - 上限只計 `PENDING` + `PICKED_UP`（04 §B：NO_SHOW／CANCELLED 釋出額度）
  - 名稱、代碼、單價、內容物名稱與加價全部快照（B-5）
  - 三層金額在交易內算好存入，讀取時不重算（02 §D）
  - commit 後才發 `order:new` 事件（Sprint 4 的 socket 與 Sprint 5 的 LINE 通知都掛在這裡）
- **取貨碼（D-02）**：`lib/pickupCode.ts` 隨機產碼 → 直接 insert → 撞 unique 就重試（最多 12 次）。
  比「先查再寫」少一次查詢，也天然免除競態（Sprint 0 NOTES 建議 3 已落實）。
- **事件匯流排** `lib/events.ts`：service 只發事件不碰 socket，
  讓交易能先 commit 再通知，測試也不必啟動 socket 伺服器。
- **畫面**：C4（ComponentPicker、數量 stepper、即時小計、加入購物車）、
  C5 購物車（分組、stepper、unavailable 灰底且擋結帳）、
  C6 結帳（TimeSlider 15 分步進、個資告知六項可摺疊、idempotencyKey 進頁即產生並存 sessionStorage）、
  C7 訂單明細（每攤一張卡、取貨碼大字可複製）、C8 我的訂單、C2 底部購物車浮動按鈕。

### 驗收結果（07 §S3）

| # | 項目 | 結果 |
|---|---|---|
| S3-1 | 購物車按攤商分組、顯示內容物與備註、小計 (80+10)×2=180 | ✅ `[auto]` 金額與分組皆驗證 |
| S3-2 | 同 listing 同內容物再加 → qty 累加不新增列 | ✅ `[auto]` |
| S3-3 | 同 listing 不同內容物 → 新增一列 | ✅ `[auto]` 另驗「備註不同」「有無內容物」也算不同列 |
| S3-4 | `qty: 0` → 該列刪除 | ✅ `[auto]` 另驗不能動別人的購物車 |
| S3-5 | 取貨時間滑桿限制在營業時間、步進 15 分 | ✅ `[auto]` 後端擋超範圍與非 15 分倍數；`[manual]` TimeSlider 已實作 |
| S3-6 | 電話 `0812345678` → 400 `VALIDATION` | ✅ `[auto]` |
| S3-7 | 購物車空 → 400 `CART_EMPTY` | ✅ `[auto]` |
| S3-8 | 已過截止 → 409 `MARKET_DAY_CLOSED` | ✅ `[auto]` 另驗 DRAFT 場次也擋；確認未留下任何 preorder |
| S3-9 | 三攤五品項含內容物 → 3 張子單、三層金額一致 | ✅ `[auto]` 300 + 530 + 180 = 1010，逐層比對 |
| S3-10 | 同 `idempotencyKey` 連送兩次 → 同一 id、DB 一筆 | ✅ `[auto]` 201 → 200；另驗別人的 key 回 403 |
| S3-11 | `max_qty=1` 兩交易同時各買 1 → 恰一個 201 | ✅ `[auto]` 另驗 NO_SHOW 後額度釋出、單筆超量也擋 |
| S3-12 | 結帳前變 SOLD_OUT → 409 且 `listingIds` 含該項 | ✅ `[auto]` 另驗交易完整回滾 |
| S3-13 | 事後改價不影響已成立訂單 | ✅ `[auto]` 連商品名稱與代碼一併改過，訂單仍是快照值 |
| S3-14 | 顧客 Y 讀顧客 X 的訂單 → 403 | ✅ `[auto]` body 不含對方姓名 |
| S3-15 | C7 每攤一張卡、取貨碼大字 | ✅ `[manual]` 已實作 |
| S3-16 | 同場次 100 筆訂單取貨碼全唯一且符合字元集 | ✅ `[auto]` 另驗不同場次可重複（每日刷新） |
| S3-17 | 下單成功後購物車為空 | ✅ `[auto]` |

`pnpm typecheck` ✅　`pnpm lint` ✅　`pnpm test` ✅ 87/87
（auth 9 + invite 23 + product 8 + image 6 + listing 9 + cart 12 + order 20）

### 實作決定

1. **取鎖順序**：`SELECT ... FOR UPDATE` 前先把 listing id 排序，
   避免兩張訂單商品重疊但順序相反時互相等待而死結。
2. **價格以鎖住的 listing 為準**，不是購物車讀到的快取值，
   避免「加入購物車後攤商改價」造成金額不一致。
3. **`idempotencyKey` 存在 sessionStorage**，同一分頁重整不會換 key；
   成功後才清除，因此重整結帳頁重送也是安全的。

---

## Sprint 4｜攤商訂單、即時推送、備貨總表、核銷

日期：2026-09-12

### 完成項目

- **API §8**：子單列表／單筆、備貨總表、`pickup/lookup`、`pickup`、狀態變更。
- **API §9**：廠商跨攤訂單總覽、合併備貨表、`export.csv`（UTF-8 with BOM）。
- **socket.io（§11、D-08）**：`plugins/socket.ts` 掛在同一個 HTTP server；
  連線用 cookie 驗證，`stall:join` 由伺服器查 `stall_member` 後才加入 room（operator 可加入任意攤）；
  事件來源是 `lib/events.ts`，service 層不直接碰 socket。
- **子單狀態機（04 §B）**：`PENDING → PICKED_UP／NO_SHOW／CANCELLED`，終態不可再轉；
  核銷用 `updateMany where status='PENDING'` 做併發保護，只有搶到的那一次算數。
- **畫面**：S6 訂單列表（socket 即時 + 60 秒 polling 備援 + 連線狀態指示 + 新單閃爍）、
  S7 訂單詳情（電話可點撥號、三個狀態按鈕）、S8 備貨總表（兩層、收到 `prep:changed` 自動重抓）、
  S9 核銷（4 格大字輸入、自動大寫與跳格、按鈕 ≥ 56px）、O6 訂單總覽（篩選、CSV、合併備貨表）。

### 驗收結果（07 §S4）

| # | 項目 | 結果 |
|---|---|---|
| S4-1 | 另一裝置下單後 3 秒內出現新單並閃爍 | ✅ `[auto]` 伺服器端已驗證：join room 後收到 `order:new` 與 `prep:changed`，payload 正確；`[manual]` 雙裝置實測待手機驗收 |
| S4-2 | socket 斷線後 60 秒 polling 補上 | ✅ 已實作（`POLL_INTERVAL_MS = 60_000`）並顯示連線狀態；`[manual]` 待手機驗收 |
| S4-3 | A 的子單列表只含 A 的子單 | ✅ `[auto]` 另驗回應不含對方商品名 |
| S4-4 | A 打 B 的每個 §4/§5/§8 端點 → 全部 403 | ✅ `[auto]` **逐一打過 15 支端點**，每支都驗 403 且 body 不含 B 的商品名、攤商名、取貨碼 |
| S4-5 | 備貨表：可頌 3、吐司 1；加起司 2 | ✅ `[auto]` |
| S4-6 | NO_SHOW 不計入備貨 | ✅ `[auto]` 另驗 CANCELLED 不計、PICKED_UP 仍計 |
| S4-7 | 正確碼 → 200 回子單摘要 | ✅ `[auto]` 另驗小寫輸入也查得到 |
| S4-8 / S4-9 | 別攤的碼與亂碼回**完全相同**的 404 | ✅ `[auto]` 用 `toEqual` 比對兩個回應完全一致 |
| S4-10 | PENDING → PICKED_UP，記時間並發 socket | ✅ `[auto]` 驗 `picked_up_by_user_id` 與事件 payload |
| S4-11 | 重複核銷 → 409 且時間不變 | ✅ `[auto]` |
| S4-12 | 場次 CLOSED 後核銷 → 409 | ✅ `[auto]` |
| S4-13 | 2 PENDING + 1 PICKED_UP → `{ noShowCount: 2 }` | ✅ `[auto]` 三張子單狀態逐一驗證 |
| S4-14 | CSV 中文正常（BOM）、欄位如 §9 | ✅ `[auto]` 驗 BOM、表頭字串完全相符、含逗號欄位正確引號包住；`[manual]` Excel 實際開啟待驗 |
| S4-15 | S9 四格自動跳格、自動大寫、按鈕 ≥ 56px | ✅ 已實作（`minHeight: 56`、`autoCapitalize`、跳格與 Backspace 回退）；`[manual]` 戶外實測待驗 |

`pnpm typecheck` ✅　`pnpm lint` ✅　`pnpm test` ✅ 116/116
（新增 authz 5 + prep-sheet 8 + pickup 11 + socket 5）

### 實作決定

1. **`socket.test.ts` 不在規格的測試檔清單內**，但 S4-1／S4-2 是 `[manual]` 且依賴兩台裝置。
   伺服器端能不能正確推送是可以自動驗的，所以加了這支；手機端的視覺行為仍留給手動驗收。
2. **查碼失敗一律回同一個回應**：測試用 `toEqual` 比對「別攤的碼」與「亂碼」的完整回應，
   避免日後有人加上不同的 message 而造成可以探測別攤取貨碼。
3. **CSV 用 fetch 取回再存成 Blob**，不是直接開連結 —— 這樣才帶得到 session cookie，
   也才能把 403 當成錯誤處理。

---

## Sprint 5｜LINE Bot 與系統通知

日期：2026-09-12

### 完成項目

- **`lib/line/sender.ts`：所有 LINE 訊息的唯一出口（B-11、04 §E）**
  - 估算 → 查額度（LINE quota API，取不到時 fallback 本地統計 Q5）→ 超過即阻擋
  - 超過額度時**每個收件人寫一筆 `SKIPPED_QUOTA` 並 throw，完全不呼叫任何 LINE API**
  - 依人數選 API：1 人 push、多人 multicast（500 一批）、`ALL_FRIENDS` broadcast
  - 每個收件人都留一筆 `notification`（SENT／FAILED／SKIPPED_QUOTA）
- **`lib/line/client.ts`**：抽成介面，測試可注入 mock（`tests/lineMock.ts`）。
  未設定 access token 時是「明確失敗」的替身，不會靜默當作成功。
- **通知**：`NEW_ORDER`（子單建立後推給該攤所有成員）、
  `PICKUP_REMINDER`（場次當天 `PICKUP_REMINDER_HOUR`，預設 08:00 台北）。
- **webhook `/line/webhook`（04 §D）**：`x-line-signature` 用 `timingSafeEqual` 驗證，
  失敗回 400 且不處理任何事件；支援 `follow`／`message.text`（邀請碼）／`postback`／`unfollow`。
  webhook 這一支自己收 raw body 才算得出簽章，註冊在獨立 scope 不影響其他 route。
- **邀請碼綁定與網頁端共用同一個 `redeemInvite` service**（03 §3）。
- **LIFF**：`POST /auth/line/liff` 用 ID token 換 session（伺服器端驗證），
  `GET /auth/liff-config` 給前端初始化用。
- **圖文選單**：`pnpm line:richmenu` 用 script 建立三格選單（不手動設定），
  重跑會先刪同名舊選單。

### 驗收結果（07 §S5）

| # | 項目 | 結果 |
|---|---|---|
| S5-1 | 錯誤簽章 → 400，不處理任何事件 | ✅ `[auto]` 另驗缺 header 也 400、且不會建立任何 app_user |
| S5-2 | `follow` → 新增 app_user，回覆含「本週市集」按鈕 | ✅ `[auto]` display_name 由 profile API 補；已存在者不重複建立 |
| S5-3 | 文字 `邀請碼 a20260912-0001`（小寫、有空白） | ✅ `[auto]` 綁定成功、碼變 REDEEMED、回覆含攤商名與攤位；另驗無空白格式 |
| S5-4 | 無效邀請碼 → 「邀請碼無效或已使用」 | ✅ `[auto]` 涵蓋不存在、已兌換、格式不符、一般文字四種 |
| S5-5 | A 有 2 位成員 → 2 筆 `NEW_ORDER` SENT、push 2 次 | ✅ `[auto]` 另驗單人走 push、跨攤各收各的、無成員不產生通知、送出失敗記 FAILED |
| S5-6 | used=199 limit=200 → 0 次 push、2 筆 SKIPPED_QUOTA、**訂單仍成立** | ✅ `[auto]` 三項都驗：訂單存在、push/multicast/broadcast 呼叫數皆為 0、兩筆 SKIPPED_QUOTA |
| S5-7 | 3 位有 PENDING → 3 筆 SENT；再執行不重複 | ✅ `[auto]` 全部取貨的那位不會收到；第二次 `sent=0, skipped=3` |
| S5-8 | 真 LINE 帳號點圖文選單三個按鈕 | ⬜ **待委託方執行**（需要 Messaging API channel 憑證） |
| S5-9 | 真攤商帳號收到新訂單訊息 | ⬜ **待委託方執行**（同上） |

`pnpm typecheck` ✅　`pnpm lint` ✅　`pnpm test` ✅ 142/142
（新增 webhook 13 + notification 13）

### 實作決定

1. **NEW_ORDER 在 commit 後 await，但例外一律吞掉**。S5-6 要求額度不足時訂單仍成立，
   所以 `createOrder` 把 `notifyNewOrder` 包在 try/catch 裡 —— sender 已經把每個收件人
   記成 `SKIPPED_QUOTA`，訂單照常回傳 201。
2. **Google 暫時帳號收不到推播**：sender 會辨識 `google:` 前綴，
   直接記 `FAILED`（錯誤訊息「此帳號不是 LINE 使用者」）而不浪費額度。已有測試覆蓋。
3. **webhook 一律回 200**（除簽章／JSON 錯誤外）。處理失敗只記 log，
   否則 LINE 會不斷重送同一批事件。

### 待委託方提供

S5-8／S5-9 需要 **Messaging API channel**（與 LINE Login **同一個 Provider**）的
channel secret 與 access token。填進 `.env` 後：
1. 到 LINE Console 把 webhook URL 設成 `{WEB_URL}/api/line/webhook` 並啟用
2. 執行 `pnpm line:richmenu` 建立圖文選單
3. 用真 LINE 帳號加好友測 S5-2／S5-3，再下一筆單測 S5-9

---

## Sprint 6｜推播申請與審核

日期：2026-09-12

### 完成項目

- **API §10 全部**：攤商申請／列表／圖片上傳；廠商列表、自發、編輯、核准、退回、估算、送出。
- **狀態機（04 §E 推播段）**：
  - `STALL_COMPOSE` → `PENDING_REVIEW` →（approve）`APPROVED` →（send）`SENT`／`FAILED`
  - `OPERATOR_COMPOSE` → `DRAFT` →（廠商填完 approve）`APPROVED`
  - 廠商自發 → 直接 `APPROVED`
  - `REJECTED` 必填原因並顯示給攤商；`SENT`／`FAILED` 是終態。
- **收件人解析（D-09）**：`ALL_FRIENDS` 走 broadcast API（人數用 insight followers，
  取不到時用 `app_user` 總數當保守值）、`MARKET_DAY_CUSTOMERS` 與 `STALL_CUSTOMERS` 走 multicast。
- **send 前必估算**：`allowed=false` 時回 409 `QUOTA_EXCEEDED` 且**狀態維持 APPROVED**，
  讓廠商調整對象或下個月再送。
- **畫面**：S10 推播申請（兩種模式）、O7 審核列表（狀態 tab）、
  O8 編輯與送出（LINE 訊息預覽、估算區、核准／退回／送出，`allowed=false` 時送出 disabled）、
  O1 儀表板（下一場次摘要 + 本月額度進度條 + 待審推播數）。

### 驗收結果（07 §S6）

| # | 項目 | 結果 |
|---|---|---|
| S6-1 | `STALL_COMPOSE` 缺 bodyText → 400 | ✅ `[auto]` 另驗缺 title 也 400、且不會留下任何 broadcast |
| S6-2 | `STALL_COMPOSE` 完整 → 201 `PENDING_REVIEW` | ✅ `[auto]` |
| S6-3 | `OPERATOR_COMPOSE` → 201 `DRAFT` | ✅ `[auto]` |
| S6-4 | `reject` 無 reason → 400 | ✅ `[auto]` 狀態維持 PENDING_REVIEW；有 reason 時攤商端看得到原因 |
| S6-5 | `approve` → APPROVED | ✅ `[auto]` 另驗已 REJECTED 的不能再核准 |
| S6-6 | DRAFT 直接 `send` → 409 `INVALID_STATE_TRANSITION` | ✅ `[auto]` 且完全沒有呼叫 LINE API |
| S6-7 | APPROVED 但 `allowed=false` → 409 `QUOTA_EXCEEDED`，狀態仍 APPROVED、無 push | ✅ `[auto]` 三項都驗 |
| S6-8 | `MARKET_DAY_CUSTOMERS` 3 位顧客 → multicast 1 次 3 人、SENT、`recipient_count=3`、3 筆 notification | ✅ `[auto]` 另驗 `STALL_CUSTOMERS` 只送給向該攤下單的人、`ALL_FRIENDS` 走 broadcast API、送出後為終態 |
| S6-9 | 攤商 A 讀 B 的推播 → 403 | ✅ `[auto]` 已併回 `authz.test.ts` 的跨攤端點掃描（現為 17 支）；另驗攤商不能自行核准或送出 |
| S6-10 | O8 預覽、估算人數、額度、退回原因顯示正確 | ✅ 已實作；`[manual]` 待委託方檢視 |

`pnpm typecheck` ✅　`pnpm lint` ✅　`pnpm test` ✅ 159/159（新增 broadcast 17）

**05-畫面規格.md 的 27 個畫面全部實作完成**，`Placeholder` 佔位元件已移除。

### ⚠️ 規格缺口：O1 的額度顯示沒有對應端點

06 迭代計畫要求 Sprint 6 的 O1 顯示「本月訊息額度使用（used / limit）」，
但 03 §10 只有 `GET /operator/broadcasts/:id/estimate` —— 那支需要一個既有的 broadcast id，
儀表板上沒有。因此新增了一支 `GET /operator/message-quota`
（回 `{ monthUsed, monthQuota, pendingReview }`）。

這讓「沒有未列出的端點」這條 DoD 出現第四個例外（前三個是 Google 登入與權限管理，見 Sprint 1）。
若要嚴格對齊規格，請把這支端點補進 `03-API契約.md` §10。

### 實作決定

1. **額度不足時不改狀態**。規格只說「409 QUOTA_EXCEEDED」，沒說狀態要怎麼變。
   保持 `APPROVED` 的好處是廠商可以改小對象或等下個月直接重送，不必重建一筆。
2. **`ALL_FRIENDS` 的估算人數同時決定額度消耗**。broadcast API 只呼叫一次，
   但 LINE 是以實際送達人數計費，所以估算仍用好友數，不是 1。

---

## Sprint 7｜硬化與交付

日期：2026-09-12

### 完成項目

- **三份操作說明**（`docs/`，非工程師可讀，各一頁）：顧客、攤商、廠商。
- **README 補完**：分階段的環境變數表、完整專案結構、ngrok 流程、
  LINE Console 設定（含**同一 Provider** 的警告）、部署步驟、重置資料。
- **個資告知六項**已在 Sprint 3 放進 C6（可摺疊），內容依
  `../06-外部事實查證與踩雷清單.md` §8：蒐集者、目的、蒐集項目、
  利用期間地區對象、利用方式、當事人權利。
- **效能量測**（見下）。
- `vite preview` 加上 proxy 設定，可在本機驗證 production build。

### 驗收結果（07 §S7）

| # | 項目 | 結果 |
|---|---|---|
| S7-1 | iOS Safari 走 C1→C7 | ⬜ **待委託方執行**（需要真 iPhone） |
| S7-2 | Android Chrome 走 C1→C7 | ⬜ **待委託方執行**（需要真 Android） |
| S7-3 | LINE 內建瀏覽器（LIFF）走 C1→C7，不需再登入 | ⬜ **待委託方執行**（需要 LIFF ID 與真 LINE 帳號） |
| S7-4 | 攤商手機走 S2→S9 | ⬜ **待委託方執行** |
| S7-5 | 4G 網路下 C2 200 筆商品首屏 < 3s | ✅ **463 ms**（見下方量測） |
| S7-6 | C6 個資告知六項存在且可摺疊 | ✅ 已實作 |
| （追加）| 27 個畫面在 375×812 無版面溢出 | ✅ 逐頁實測 `scrollWidth === innerWidth === 375`；少數元素超出視窗寬度的都在 `overflow-x-auto` 容器內（規格要求的攤商 chips），頁面本身不會橫向捲動 |
| （追加）| 桌面版（1440×900）不壞 | ✅ 逐頁實測零溢出；顧客／攤商內容欄 640px 置中、廠商後台 1024px。帳號與權限在 `md` 以上改用表格，以下維持卡片 |
| S7-7 | 第三人依 README 從零跑起來 | 🟡 README 已寫完整；**實際由第三人驗證待執行** |
| S7-8 | `pnpm test` 全綠、`typecheck` 無錯、`lint` 無錯 | ✅ 159/159、0 錯、0 錯 |
| S7-9 | NOTES.md 含已知限制、Non-goals、延後建議 | ✅ 見下方「交付狀態」 |

### S7-5 效能量測結果

用 Chrome DevTools Protocol，375×812 手機 viewport，同一個場次 **200 個 listing**，
量到「商品卡片實際渲染出來」為止，每組跑 5 次取中位數：

| 情境 | 中位數 | 最慢 |
|---|---|---|
| production build + **模擬 4G**（RTT 70ms／12Mbps／3Mbps） | **463 ms** | 471 ms |
| dev server + 本機無限速 | 157 ms | 465 ms（首次含編譯） |

production bundle：JS 390 KB（gzip 115 KB）、CSS 25 KB（gzip 5 KB）。
規格門檻是 4G 下 < 3s、本機 < 2s，兩者都有大幅餘裕。

> 量測腳本沒有納入版控（一次性工具）。要重現的話：
> `pnpm --filter @market/web build && pnpm --filter @market/web preview`，
> 再用任何 Lighthouse／CDP 工具量 `/days/{id}`。

---

# 交付狀態

## 完成度

- **8 個 Sprint 全部實作完成**（Sprint 0～7）
- **27 個畫面**（05-畫面規格.md）全部完成
- **自動測試 159 項全綠**，涵蓋 07-驗收條件.md 所有 `[auto]` 項目
- `pnpm typecheck`／`pnpm lint` 皆無錯誤

| 測試檔 | 測項 | 對應驗收 |
|---|---|---|
| `auth.test.ts` | 9 | S0-3～6 |
| `invite.test.ts` | 23 | S1-1、S1-3～11 |
| `product.test.ts` | 8 | S2-1、S2-2、S2-8 |
| `image.test.ts` | 6 | S2-3～5 |
| `listing.test.ts` | 9 | S2-6、S2-7、S2-9、S2-10 |
| `cart.test.ts` | 12 | S3-1～4 |
| `order.test.ts` | 20 | S3-6～14、S3-16、S3-17 |
| `authz.test.ts` | 5 | S4-3、S4-4、S6-9 |
| `prep-sheet.test.ts` | 8 | S4-5、S4-6、S4-14 |
| `pickup.test.ts` | 11 | S4-7～13 |
| `socket.test.ts` | 5 | S4-1（伺服器端） |
| `webhook.test.ts` | 13 | S5-1～4 |
| `notification.test.ts` | 13 | S5-5～7 |
| `broadcast.test.ts` | 17 | S6-1～8 |

## 待委託方執行的項目

這些**不是沒做**，是需要委託方提供的東西或真實裝置才能驗：

### 1. LINE 憑證（擋住 5 個驗收項）

需要在**同一個 Provider** 下建立 LINE Login channel 與 Messaging API channel。
填進 `.env` 後即可驗 **S0-2、S5-8、S5-9、S7-3**。

程式路徑都已完成並可觸達；未設定時端點會回明確錯誤而不是 500。

> 在那之前可以用**帳號密碼註冊**（`LOCAL_LOGIN_ENABLED=true`）先登入測試其他所有功能，
> 但這種帳號收不到 LINE 推播，所以 S5 的手動項目仍然驗不了。

### 2. 真實手機（擋住 4 個驗收項）

**S7-1／S7-2／S7-4** 需要 iPhone 與 Android 實機。
公開網址已用 ngrok 打通，現在就可以開來測。
版面已在 375×812 驗過無橫向溢出。

### 3. 正式部署平台（Sprint 0 範圍的最後一項）

README 的部署步驟已寫完整，但**沒有實際部署**。需要委託方決定平台
（建議 Zeabur／Render／Fly + Neon）。ngrok 是開發期替代方案，不是交付狀態。

### 4. `STORAGE_DRIVER=s3` 未實作

D-12 說正式環境用 S3 相容儲存。目前設成 `s3` 會丟出明確錯誤而不是靜默寫本機。
若部署平台有持久化磁碟，用 `local` 即可；否則需要補上 S3 client。

## 規格外的追加（委託方 2026-09-12 口頭指示）

以下五項**不在 spec 內**，都標成可拔除：

1. **帳號密碼註冊／登入**（`/auth/local/*`）—— LINE、Google 都還沒申請下來時的登入通道。
   詳見下一節。
2. **Google 第三方登入** —— 同上，但需要先建 Google OAuth client。
   ⚠️ 這種帳號**收不到 LINE 推播**，正式身分來源仍是 LINE Login（D-11）。
3. **帳號與權限頁**（`/operator/permissions`）—— 不新增 role，把 `operator` 當系統管理身分。
4. **身分模擬** —— 換發 session，權限真的降級。`ENABLE_IMPERSONATION` 預設 false。
5. **`GET /operator/message-quota`** —— O1 儀表板顯示額度所需，但 §10 未列出（規格缺口）。

這五項讓「新增的 API 都在 03-API契約.md 有對應」這條 DoD 不成立。
要回到純規格狀態，照各段落的移除方式處理即可。

### 帳號密碼註冊／登入的設計與移除方式

**為什麼要有**：LINE Login channel 與 Google OAuth client 都需要向外部申請，
在那之前完全沒有人能登入系統，連驗收都做不了。

**設計**（刻意做成最容易拔掉的形狀）：

- 憑證存在**獨立的 `local_credential` 表**（`user_id` / `username` / `password_hash`），
  `app_user` 維持與 `spec/schema.sql` **完全一致**，一個欄位都沒改。
- 帳號以 `local:{username}` 寫進 `app_user.line_user_id`，
  與 LINE（`U...`）和 Google（`google:...`）不會互相碰撞。
- 密碼用 Node 內建 `scrypt`（隨機 salt、`timingSafeEqual` 比對），**沒有新增相依套件**。
- 帳號不分大小寫，一律轉小寫存。
- **帳號不存在與密碼錯誤回完全相同的 401**，不透露帳號是否存在（有測試用 `toEqual` 把關）。
- **系統還沒有任何 operator 時，第一個註冊者自動成為管理員** ——
  否則沒有 LINE 就沒人進得了後台（bootstrap 問題）。會在伺服器 log 留下 warn。
- 以 `LOCAL_LOGIN_ENABLED` 控制，**預設 false**。
- 這種帳號同樣**收不到 LINE 推播**（sender 會辨識 `local:` 前綴並記 FAILED）。

**測試**：`tests/localAuth.test.ts` 19 個測項，涵蓋雜湊隨機性、密碼不落明文、
第一個帳號升管理員、帳號重複、大小寫、密碼長度、錯誤訊息一致性、失敗不發 cookie、
以及 `ON DELETE CASCADE`。

**移除方式**（接上 LINE Login 之後）：

```sql
DROP TABLE local_credential;
```

再刪掉 `apps/api/src/lib/localAuth.ts`、`service.ts` 的
`registerLocalUser`／`loginLocalUser`、`routes.ts` 的 `/auth/local/*` 兩支 route、
`schema.prisma` 的 `LocalCredential` model 與 `AppUser.localCredential`、
以及 C9 登入頁的表單區塊，最後把 `.env` 的 `LOCAL_LOGIN_ENABLED` 拿掉。

## Non-goals 確認（00 §C）

以下全程未實作，也不應該被實作：

線上金流／退款／發票、真實簡訊 OTP（電話只收集不驗證）、攤商自助註冊、
顧客自行取消訂單、庫存進銷存成本、多語系、原生 App、Email 通知、多層巢狀內容物。

## 已知限制

1. **`STORAGE_DRIVER=s3` 未實作**（見上）。
2. **JWT 是無狀態的**，登出只清 cookie；被竊的 token 在 30 天內仍有效。
   若需要強制登出，要改成有狀態 session 或加短效 token + refresh。
3. **ngrok 免費方案網址會變**，每次重開都要重跑 `pnpm dev` 並更新 LINE Console 的 Callback URL。
4. **取貨碼 4 碼共 31⁴ ≈ 92 萬組**，同場次唯一。單場訂單量遠低於此，
   但若未來單場超過數萬筆，碰撞重試會變頻繁。
5. **Windows 上跑 `pnpm build` 前要先停掉 `pnpm dev`**（dev server 佔住 Prisma query engine DLL）。
6. **`app_user` 沒有停用欄位**，權限管理頁只能改角色與攤商綁定，不能停用帳號。
   schema.sql 沒有這個欄位，加了就偏離規格。

## 被延後的建議（不實作，待委託方決定）

1. **前端資料抓取**目前是手寫 `useApi` hook。畫面已達 27 個，
   若之後要加快取與樂觀更新，可考慮 TanStack Query —— 但這是新的相依套件，需要同意。
2. **`invite_code` 流水號**每次掃該場次全部未回收的碼。單場數十攤沒問題，
   上百攤時改成在 `market_day` 放 counter 會更省。
3. **推播圖片**目前存在本機並用 `WEB_URL` 組出絕對網址。
   LINE 要求圖片網址必須是公開 HTTPS，正式環境務必確認 `WEB_URL` 正確且圖片可公開存取。
4. **備貨總表沒有安全係數**（Q-04 預設不加）。若攤商反映常常不夠，
   可加一個 `.env` 百分比設定。
5. **O4 結案確認框**目前是固定文字。要顯示「將轉為未取的筆數」，
   可以接上 §9 的 `GET /operator/market-days/:id/sub-orders?status=PENDING`。
6. **socket 目前是單機記憶體**。若之後要跑多個 API instance，
   需要加 socket.io 的 Redis adapter，否則推播只會到同一台機器上的連線。
