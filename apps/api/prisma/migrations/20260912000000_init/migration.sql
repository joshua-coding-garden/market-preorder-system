-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'operator');

-- CreateEnum
CREATE TYPE "MarketDayStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ON_SALE', 'SOLD_OUT', 'OFF_SHELF');

-- CreateEnum
CREATE TYPE "SubOrderStatus" AS ENUM ('PENDING', 'PICKED_UP', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'EXPIRED', 'RECYCLED');

-- CreateEnum
CREATE TYPE "ComposeMode" AS ENUM ('OPERATOR_COMPOSE', 'STALL_COMPOSE');

-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('ALL_FRIENDS', 'MARKET_DAY_CUSTOMERS', 'STALL_CUSTOMERS');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('NEW_ORDER', 'PICKUP_REMINDER', 'BROADCAST');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED_QUOTA');

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "line_user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL DEFAULT '',
    "picture_url" TEXT,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ(6),

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_day" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "market_id" UUID NOT NULL,
    "event_date" DATE NOT NULL,
    "open_time" TIME(0) NOT NULL,
    "close_time" TIME(0) NOT NULL,
    "order_deadline" TIMESTAMPTZ(6) NOT NULL,
    "location_note" TEXT,
    "status" "MarketDayStatus" NOT NULL DEFAULT 'DRAFT',
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stall" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "logo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stall_member" (
    "user_id" UUID NOT NULL,
    "stall_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stall_member_pkey" PRIMARY KEY ("user_id","stall_id")
);

-- CreateTable
CREATE TABLE "participation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "market_day_id" UUID NOT NULL,
    "stall_id" UUID NOT NULL,
    "booth_no" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_code" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "participation_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "recyclable_at" TIMESTAMPTZ(6) NOT NULL,
    "redeemed_by_user_id" UUID,
    "redeemed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stall_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "thumb_url" TEXT,
    "base_price" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_component" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "extra_price" INTEGER NOT NULL DEFAULT 0,
    "allow_custom_note" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "market_day_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "stall_id" UUID NOT NULL,
    "price" INTEGER NOT NULL,
    "max_qty" INTEGER,
    "status" "ListingStatus" NOT NULL DEFAULT 'ON_SALE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "market_day_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cart_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_item_component" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cart_item_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "custom_note" TEXT,

    CONSTRAINT "cart_item_component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preorder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "market_day_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "contact_name" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "pickup_at" TIME(0) NOT NULL,
    "note" TEXT,
    "total_amount" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preorder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_order" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "preorder_id" UUID NOT NULL,
    "market_day_id" UUID NOT NULL,
    "stall_id" UUID NOT NULL,
    "booth_no" TEXT NOT NULL,
    "pickup_code" TEXT NOT NULL,
    "status" "SubOrderStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" INTEGER NOT NULL,
    "picked_up_at" TIMESTAMPTZ(6),
    "picked_up_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sub_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sub_order_id" UUID NOT NULL,
    "listing_id" UUID,
    "product_code" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "line_total" INTEGER NOT NULL,

    CONSTRAINT "order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_component" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_item_id" UUID NOT NULL,
    "component_id" UUID,
    "name" TEXT NOT NULL,
    "extra_price" INTEGER NOT NULL,
    "custom_note" TEXT,

    CONSTRAINT "order_item_component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "market_day_id" UUID,
    "stall_id" UUID,
    "requested_by_user_id" UUID NOT NULL,
    "compose_mode" "ComposeMode" NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body_text" TEXT NOT NULL DEFAULT '',
    "image_url" TEXT,
    "audience" "Audience" NOT NULL DEFAULT 'ALL_FRIENDS',
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "reject_reason" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "recipient_count" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "NotificationKind" NOT NULL,
    "ref_id" UUID,
    "user_id" UUID,
    "line_user_id" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 1,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_line_user_id_key" ON "app_user"("line_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "market_code_key" ON "market"("code");

-- CreateIndex
CREATE INDEX "idx_market_day_status_date" ON "market_day"("status", "event_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "market_day_market_id_event_date_key" ON "market_day"("market_id", "event_date");

-- CreateIndex
CREATE INDEX "idx_stall_member_stall" ON "stall_member"("stall_id");

-- CreateIndex
CREATE UNIQUE INDEX "participation_market_day_id_stall_id_key" ON "participation"("market_day_id", "stall_id");

-- CreateIndex
CREATE UNIQUE INDEX "participation_market_day_id_booth_no_key" ON "participation"("market_day_id", "booth_no");

-- CreateIndex
CREATE INDEX "idx_product_stall" ON "product"("stall_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "product_stall_id_code_key" ON "product"("stall_id", "code");

-- CreateIndex
CREATE INDEX "idx_component_product" ON "product_component"("product_id", "is_active");

-- CreateIndex
CREATE INDEX "idx_listing_day_stall" ON "listing"("market_day_id", "stall_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "listing_market_day_id_product_id_key" ON "listing"("market_day_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_user_id_market_day_id_key" ON "cart"("user_id", "market_day_id");

-- CreateIndex
CREATE INDEX "idx_cart_item_cart" ON "cart_item"("cart_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_item_component_cart_item_id_component_id_key" ON "cart_item_component"("cart_item_id", "component_id");

-- CreateIndex
CREATE UNIQUE INDEX "preorder_idempotency_key_key" ON "preorder"("idempotency_key");

-- CreateIndex
CREATE INDEX "idx_preorder_user" ON "preorder"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_preorder_day" ON "preorder"("market_day_id");

-- CreateIndex
CREATE INDEX "idx_sub_order_stall_day" ON "sub_order"("stall_id", "market_day_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sub_order_preorder_id_stall_id_key" ON "sub_order"("preorder_id", "stall_id");

-- CreateIndex
CREATE UNIQUE INDEX "sub_order_market_day_id_pickup_code_key" ON "sub_order"("market_day_id", "pickup_code");

-- CreateIndex
CREATE INDEX "idx_order_item_sub" ON "order_item"("sub_order_id");

-- CreateIndex
CREATE INDEX "idx_oic_item" ON "order_item_component"("order_item_id");

-- CreateIndex
CREATE INDEX "idx_broadcast_status" ON "broadcast"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_notification_month" ON "notification"("created_at", "status");

-- CreateIndex
CREATE INDEX "idx_notification_ref" ON "notification"("kind", "ref_id");

-- AddForeignKey
ALTER TABLE "market_day" ADD CONSTRAINT "market_day_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stall_member" ADD CONSTRAINT "stall_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stall_member" ADD CONSTRAINT "stall_member_stall_id_fkey" FOREIGN KEY ("stall_id") REFERENCES "stall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participation" ADD CONSTRAINT "participation_market_day_id_fkey" FOREIGN KEY ("market_day_id") REFERENCES "market_day"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participation" ADD CONSTRAINT "participation_stall_id_fkey" FOREIGN KEY ("stall_id") REFERENCES "stall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_code" ADD CONSTRAINT "invite_code_participation_id_fkey" FOREIGN KEY ("participation_id") REFERENCES "participation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_code" ADD CONSTRAINT "invite_code_redeemed_by_user_id_fkey" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_stall_id_fkey" FOREIGN KEY ("stall_id") REFERENCES "stall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_component" ADD CONSTRAINT "product_component_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_market_day_id_fkey" FOREIGN KEY ("market_day_id") REFERENCES "market_day"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_stall_id_fkey" FOREIGN KEY ("stall_id") REFERENCES "stall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart" ADD CONSTRAINT "cart_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart" ADD CONSTRAINT "cart_market_day_id_fkey" FOREIGN KEY ("market_day_id") REFERENCES "market_day"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_component" ADD CONSTRAINT "cart_item_component_cart_item_id_fkey" FOREIGN KEY ("cart_item_id") REFERENCES "cart_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_component" ADD CONSTRAINT "cart_item_component_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "product_component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preorder" ADD CONSTRAINT "preorder_market_day_id_fkey" FOREIGN KEY ("market_day_id") REFERENCES "market_day"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preorder" ADD CONSTRAINT "preorder_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_order" ADD CONSTRAINT "sub_order_preorder_id_fkey" FOREIGN KEY ("preorder_id") REFERENCES "preorder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_order" ADD CONSTRAINT "sub_order_market_day_id_fkey" FOREIGN KEY ("market_day_id") REFERENCES "market_day"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_order" ADD CONSTRAINT "sub_order_stall_id_fkey" FOREIGN KEY ("stall_id") REFERENCES "stall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_order" ADD CONSTRAINT "sub_order_picked_up_by_user_id_fkey" FOREIGN KEY ("picked_up_by_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_sub_order_id_fkey" FOREIGN KEY ("sub_order_id") REFERENCES "sub_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_component" ADD CONSTRAINT "order_item_component_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_component" ADD CONSTRAINT "order_item_component_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "product_component"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast" ADD CONSTRAINT "broadcast_market_day_id_fkey" FOREIGN KEY ("market_day_id") REFERENCES "market_day"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast" ADD CONSTRAINT "broadcast_stall_id_fkey" FOREIGN KEY ("stall_id") REFERENCES "stall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast" ADD CONSTRAINT "broadcast_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast" ADD CONSTRAINT "broadcast_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================
-- 以下為手寫區塊（02-資料模型.md §G）：
-- Prisma schema 無法宣告的 CHECK 約束與 partial unique index，
-- 對齊 spec/schema.sql。修改 schema.prisma 後重新產生 migration 時，
-- 這一段必須一併保留。
-- ============================================================

-- gen_random_uuid()：PG13+ 內建，仍依 spec/schema.sql 明確啟用 pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- app_user ----------
ALTER TABLE "app_user"
  ADD CONSTRAINT app_user_role_check CHECK ("role" IN ('user', 'operator'));

-- ---------- market ----------
ALTER TABLE "market"
  ADD CONSTRAINT market_code_check CHECK ("code" ~ '^[A-Z0-9]{1,4}$');

-- ---------- market_day ----------
ALTER TABLE "market_day"
  ADD CONSTRAINT market_day_time_check CHECK ("close_time" > "open_time");

-- ---------- invite_code ----------
ALTER TABLE "invite_code"
  ADD CONSTRAINT invite_code_code_check
  CHECK ("code" ~ '^[A-Z0-9]{1,4}[0-9]{8}-[0-9]{4}$');

-- 同一字串在回收前不得重複存在（D-03）
CREATE UNIQUE INDEX uq_invite_code_live
  ON "invite_code"("code") WHERE "status" <> 'RECYCLED';

-- 一個參與同時只有一張有效碼（04 §C）
CREATE UNIQUE INDEX uq_invite_code_active
  ON "invite_code"("participation_id") WHERE "status" = 'ACTIVE';

-- ---------- product ----------
ALTER TABLE "product"
  ADD CONSTRAINT product_code_check CHECK ("code" ~ '^[A-Za-z0-9-]{1,16}$');
ALTER TABLE "product"
  ADD CONSTRAINT product_base_price_check CHECK ("base_price" >= 0);

-- ---------- product_component ----------
ALTER TABLE "product_component"
  ADD CONSTRAINT product_component_extra_price_check CHECK ("extra_price" >= 0);

-- ---------- listing ----------
ALTER TABLE "listing"
  ADD CONSTRAINT listing_price_check CHECK ("price" >= 0);
ALTER TABLE "listing"
  ADD CONSTRAINT listing_max_qty_check CHECK ("max_qty" IS NULL OR "max_qty" > 0);

-- ---------- cart_item ----------
ALTER TABLE "cart_item"
  ADD CONSTRAINT cart_item_qty_check CHECK ("qty" > 0);

-- ---------- preorder ----------
ALTER TABLE "preorder"
  ADD CONSTRAINT preorder_contact_phone_check CHECK ("contact_phone" ~ '^09[0-9]{8}$');
ALTER TABLE "preorder"
  ADD CONSTRAINT preorder_total_amount_check CHECK ("total_amount" >= 0);

-- ---------- sub_order ----------
ALTER TABLE "sub_order"
  ADD CONSTRAINT sub_order_pickup_code_check
  CHECK ("pickup_code" ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$');
ALTER TABLE "sub_order"
  ADD CONSTRAINT sub_order_subtotal_check CHECK ("subtotal" >= 0);

-- ---------- order_item ----------
ALTER TABLE "order_item"
  ADD CONSTRAINT order_item_unit_price_check CHECK ("unit_price" >= 0);
ALTER TABLE "order_item"
  ADD CONSTRAINT order_item_qty_check CHECK ("qty" > 0);
ALTER TABLE "order_item"
  ADD CONSTRAINT order_item_line_total_check CHECK ("line_total" >= 0);

-- ---------- order_item_component ----------
ALTER TABLE "order_item_component"
  ADD CONSTRAINT order_item_component_extra_price_check CHECK ("extra_price" >= 0);
