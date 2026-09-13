-- ⚠️ 偏離 D-02（委託方 2026-09-13 指示）：
-- 取貨碼從「4 碼亂碼」改成「攤商位置-流水號」，例：B03-001
--
-- 原規格：4 碼，字元集 23456789ABCDEFGHJKMNPQRSTUVWXYZ，同場次唯一。
-- 新格式：{booth_no}-{3 位流水號}，流水號在「同一場次同一攤位」內從 001 起。
--
-- UNIQUE(market_day_id, pickup_code) 仍然成立：
-- participation 已保證 (market_day_id, booth_no) 唯一，所以同場次不同攤的前綴必不相同，
-- 同攤則靠流水號區分。「每日刷新」也自然成立，因為流水號是按場次計算的。

-- 先放寬舊的 CHECK，才能改寫既有資料
ALTER TABLE "sub_order" DROP CONSTRAINT IF EXISTS sub_order_pickup_code_check;

-- 既有訂單一律重新編號：同場次同攤位依建立時間 001、002…
UPDATE "sub_order" so
SET "pickup_code" = numbered.new_code
FROM (
  SELECT id,
         booth_no || '-' || lpad(
           row_number() OVER (
             PARTITION BY market_day_id, stall_id ORDER BY created_at, id
           )::text, 3, '0'
         ) AS new_code
  FROM "sub_order"
) numbered
WHERE numbered.id = so.id;

-- booth_no 是自由文字（可能含中文），所以只約束整體形狀：結尾必須是 -數字
ALTER TABLE "sub_order"
  ADD CONSTRAINT sub_order_pickup_code_check
  CHECK ("pickup_code" ~ '^.+-[0-9]{3,}$');
