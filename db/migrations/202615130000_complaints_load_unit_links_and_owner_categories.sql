-- 202615130000_complaints_load_unit_links_and_owner_categories.sql
-- SUPERSEDED -- intentionally a no-op. Never applied when neutralised (2026-10-01).
--
-- CC-1 authored this for ORDERS 2026-10-01 row 5 (safety.complaints load_id / unit_id + LATENESS /
-- REFUSED-DISPATCH / DAMAGE). The Lead's ruling 2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END
-- withdrew row 5 and gave it to CC-2, which had already merged the same change as
-- 202615100000_complaints_load_unit_link_and_categories.sql. Running both would add two redundant
-- indexes (idx_complaints_load_id / idx_complaints_unit_id beside CC-2's idx_safety_complaints_load /
-- _unit) -- a second migration for the same fact. 202615100000 is the one owner of this change.
-- The file is kept (never delete) and the number stays claimed; it does nothing.

SELECT 1;
