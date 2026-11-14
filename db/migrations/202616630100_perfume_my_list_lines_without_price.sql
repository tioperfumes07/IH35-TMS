-- PERFUME-DESK (owner 2026-11-14): "my lists there are 583 rows - 1 header, so 582 items" — two lines of his own offer
-- list (JC PEACE LOVE EDP 50ML qty 11, TOUS NEON CANDY EDT 90ml qty 600) carry no price and were dropped at import.
-- On the owner's OWN lists (offer / inventory) a line without a price is still an item he holds; the price stays empty
-- (never 0, never guessed). Supplier and competitor lists keep requiring a price (enforced by the importer).
-- Isolated perfume schema (ScentsX LLC), never posts to accounting. Idempotent.
ALTER TABLE perfume.price_list_rows ALTER COLUMN price_cents DROP NOT NULL;
