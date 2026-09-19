-- ⚠️ 規格外（委託方 2026-09-20 指示）：
--   1. 上架審核機制（可由管理後台開關）
--   2. 訂單「店家確認中」狀態：店家確認了才算成立
--   3. 全站容量上限（每攤品項數、攤商總數）
--   4. 市集可停用

-- ---------------------------------------------------------------- 1. 上架審核
CREATE TYPE "ListingApproval" AS ENUM ('APPROVED', 'PENDING_REVIEW', 'REJECTED');

ALTER TABLE "listing"
  ADD COLUMN "approval"            "ListingApproval" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "reject_reason"       TEXT,
  ADD COLUMN "reviewed_at"         TIMESTAMPTZ(6),
  ADD COLUMN "reviewed_by_user_id" UUID;

ALTER TABLE "listing" ADD CONSTRAINT "listing_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "app_user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 駁回一定要有理由，通過則不該留著理由
ALTER TABLE "listing"
  ADD CONSTRAINT listing_reject_reason_check
  CHECK (("approval" = 'REJECTED') = ("reject_reason" IS NOT NULL));

CREATE INDEX "idx_listing_approval" ON "listing"("approval");

-- 既有上架維持 APPROVED（欄位預設值），不會因為開了審核就整批消失

-- ---------------------------------------------------------------- 2. 店家確認
-- PG 允許在交易內 ADD VALUE，但同一個交易裡不能使用這個新值，
-- 所以這裡只加值，不在本檔用它更新任何資料。
ALTER TYPE "SubOrderStatus" ADD VALUE 'PENDING_CONFIRM' BEFORE 'PENDING';

ALTER TABLE "sub_order"
  ADD COLUMN "confirmed_at"         TIMESTAMPTZ(6),
  ADD COLUMN "confirmed_by_user_id" UUID;

ALTER TABLE "sub_order" ADD CONSTRAINT "sub_order_confirmed_by_user_id_fkey"
  FOREIGN KEY ("confirmed_by_user_id") REFERENCES "app_user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 既有訂單視為「店家已確認」：它們是在這個機制上線前成立的，
-- 讓它們留在 PENDING 並補一個確認時間，攤商不用回頭重按一次。
UPDATE "sub_order"
SET "confirmed_at" = "created_at"
WHERE "status" <> 'CANCELLED' AND "confirmed_at" IS NULL;

-- ---------------------------------------------------------------- 3. 全站設定
CREATE TABLE "system_setting" (
  "id"                        INTEGER      NOT NULL DEFAULT 1,
  "listing_approval_required" BOOLEAN      NOT NULL DEFAULT false,
  "max_products_per_stall"    INTEGER      NOT NULL DEFAULT 10,
  "max_stalls"                INTEGER      NOT NULL DEFAULT 200,
  "updated_at"                TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_user_id"        UUID,

  CONSTRAINT "system_setting_pkey" PRIMARY KEY ("id")
);

-- 永遠只有一列
ALTER TABLE "system_setting"
  ADD CONSTRAINT system_setting_singleton_check CHECK ("id" = 1);
ALTER TABLE "system_setting"
  ADD CONSTRAINT system_setting_limits_check
  CHECK ("max_products_per_stall" > 0 AND "max_stalls" > 0);

INSERT INTO "system_setting" ("id") VALUES (1);

-- ---------------------------------------------------------------- 4. 市集停用
ALTER TABLE "market" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
