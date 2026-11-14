-- PERFUME-DESK (owner 2026-11-14): "in purchase compare vendors i need to have a column for my last cost, date,
-- quantity purchased, current inventory, qty sold, so i can see how well i did in that time frame. the last price i
-- purchased is important because prices change weekly." My inventory file carries these per line; they are the
-- owner's own figures, stored as given (never derived). Nullable — supplier and competitor lists never have them.
-- Isolated perfume schema (ScentsX LLC), never posts to accounting. Additive, idempotent.
ALTER TABLE perfume.price_list_rows ADD COLUMN IF NOT EXISTS purchase_date date;
ALTER TABLE perfume.price_list_rows ADD COLUMN IF NOT EXISTS qty_purchased integer;
ALTER TABLE perfume.price_list_rows ADD COLUMN IF NOT EXISTS qty_sold integer;
