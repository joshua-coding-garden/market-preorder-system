-- ⚠️ 偏離 spec/schema.sql（委託方 2026-09-13 指示）：
-- 特製備註從「每個內容物一個」改成「每個商品項目一個」。
--
-- 原本 01-領域與角色.md §A 定義 custom_note 是「顧客對某個內容物填的文字」，
-- 因此欄位在 cart_item_component / order_item_component 上。
-- 委託方要求改成一個商品項目共用一個備註，所以把欄位上移到 item 層。
--
-- cart_item_component.custom_note 與 order_item_component.custom_note 兩欄保留
-- （schema.sql 有定義），但不再寫入，避免同一份資料有兩個來源。

ALTER TABLE "cart_item" ADD COLUMN "custom_note" TEXT;
ALTER TABLE "order_item" ADD COLUMN "custom_note" TEXT;

-- 既有資料搬移：把該項目底下第一個有備註的內容物備註提上來
UPDATE "cart_item" ci
SET "custom_note" = sub.note
FROM (
  SELECT DISTINCT ON (cart_item_id) cart_item_id, custom_note AS note
  FROM "cart_item_component"
  WHERE custom_note IS NOT NULL AND custom_note <> ''
  ORDER BY cart_item_id, id
) sub
WHERE sub.cart_item_id = ci.id;

UPDATE "order_item" oi
SET "custom_note" = sub.note
FROM (
  SELECT DISTINCT ON (order_item_id) order_item_id, custom_note AS note
  FROM "order_item_component"
  WHERE custom_note IS NOT NULL AND custom_note <> ''
  ORDER BY order_item_id, id
) sub
WHERE sub.order_item_id = oi.id;
