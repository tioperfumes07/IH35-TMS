-- LEAD RULINGS 443.116 #1 (owner design 2026-10-12): "THE COSTS SHOULD POST DAILY, AS THEY ARE RECEIVED FROM RELAY, ETC."
-- Per-company switch for the receipt-time fuel post: when ON, a fill (Relay fill / card fuel transaction) posts when it is
-- RECEIVED through the one fill poster (accounting/bank-recon/bank-match-fuel-post.service.ts postFuelFillOnReceipt); the
-- card / wallet bank line then only matches it. When OFF (default, every company) the fill posts when its bank line is
-- matched, exactly as before (OWNER RULING 2026-10-02). Seeded OFF; turned on per company through the Owner flag override
-- route (POST /api/feature-flags/overrides), never by this migration.
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'FUEL_POSTS_ON_RECEIPT_ENABLED',
  'LEAD 443.116 #1: when ON for a company, a fuel fill posts when it is received (Relay fill: Dr fuel per product + Dr Fuel Card Fees / Cr Relay Fuel Wallet; card fill: Dr fuel / Cr Dreamline Diesel Card Payable) with its expense document on the load; the bank line only matches it. Default OFF: the fill posts at bank match.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;
