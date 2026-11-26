-- PERFUME-TRADE-SHOW-CONTACT-DATA (owner 2026-11-26 17:08 CT: "for trade shows, i need the contact data the website so i
-- can click and take me there to register etc."). Each show keeps its organizer, the page to register on, and the
-- organizer's email and phone, next to the website column it already has. Additive, idempotent; perfume schema only.
ALTER TABLE perfume.trade_shows ADD COLUMN IF NOT EXISTS organizer text;
ALTER TABLE perfume.trade_shows ADD COLUMN IF NOT EXISTS register_url text;
ALTER TABLE perfume.trade_shows ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE perfume.trade_shows ADD COLUMN IF NOT EXISTS contact_phone text;

