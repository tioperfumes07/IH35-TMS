# Deployment Notes

## P3-T11.18 cleanup (2026-05-07)

- Local `.env`: change `DATABASE_DIRECT_URL` from `sslmode=require` to `sslmode=verify-full`.
- Render env (IH35-TMS backend service): apply the same change (`sslmode=require` -> `sslmode=verify-full`).
- After updating env vars, run `npm run db:verify:safety-v6-4` to confirm connectivity and safety v6.4 verification still pass.

Notes:
- This block documents the required environment update only.
- Render environment changes are intentionally deferred for manual application in P3-GATE.
