-- ⚠️ 規格外：帳號密碼登入的憑證（委託方 2026-09-12 指示）
--
-- 刻意獨立成一張表，app_user 維持與 spec/schema.sql 完全一致。
-- 之後接上 LINE Login 要移除時，只需要：
--   DROP TABLE local_credential;
-- 並刪掉 apps/api/src/lib/localAuth.ts 與 /auth/local/* 兩支 route。

CREATE TABLE "local_credential" (
    "user_id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "local_credential_pkey" PRIMARY KEY ("user_id")
);

CREATE UNIQUE INDEX "local_credential_username_key" ON "local_credential"("username");

ALTER TABLE "local_credential"
  ADD CONSTRAINT "local_credential_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 帳號：3–20 碼英數與底線，登入時一律轉小寫
ALTER TABLE "local_credential"
  ADD CONSTRAINT local_credential_username_check
  CHECK ("username" ~ '^[a-z0-9_]{3,20}$');
