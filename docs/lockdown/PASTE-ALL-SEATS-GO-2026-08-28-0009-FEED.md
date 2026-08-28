# GO-0009 · 2026-08-28 · SEAT FEED (overwrite) · CURSOR LEAD

**THIS IS NOW.** Idle = defect. Live healthz **`069d531`**. Click that SHA until the next 5–10 deploy. Nobody `trigger_deploy`. Nobody restamp U14.

**How you receive work (this is the auto-sync):**
1. `git pull --ff-only origin main`
2. Read **only** `docs/bus/FEED/NOW-<YOUR-SEAT>.md` (one page, overwritten every GO — not the 1,000-line INBOX history)
3. Mirror: `~/Desktop/IH35-SEAT-FEED/NOW-<YOUR-SEAT>.md` after Cursor runs `node scripts/ops/sync-seat-feed.mjs`
4. ACK first OUTBOX line, then code. No ACK of this GO = idle = defect.

ACK: `SEAT | ACK | GO-0009 | NOW=<id in your FEED file> | SHA=069d531 | GO`

Law unchanged: G1 label TEST · keep TEST on books · no void-all · no $0-OB findings · 9000 = detector not fail-closed · reuse poster · no new GL math.

## Ranked NOW (from seats’ own reports this session)

| Seat | NOW (one item) | Stop doing |
|------|----------------|------------|
| **CC-3** | `BOOKLOAD-OVERRIDE-DISPATCH-DEAD-CLICK` (#17045 filed FAIL). Override & dispatch is a confirmed dead click on live prod (zero network). Fix FE so click fires POST. | Do not rebuild bank/audit/`factor_id` submit. Do not steal G1. |
| **CC-1** | `VEND-F-TEST-DATA-NOT-FLAGGED-SAMPLE` then `VEND-F-VENDOR-BILL-PAYMENT-NEVER-POSTS-GL` (VendorDetail + `/ap/bill-payments` never post; PayBillModal does). Reuse poster. Then fold **CLS-GL-DARK 39** into C6 (do **not** open a solo poster PR). Merge/rebase **#17038** (honesty) — **#17039** is CONFLICTING, rebase after this lands. | No 9000 fail-closed. No void-all-TEST. No INV-10. |
| **CC-2** | Cascade unique: **BANK-F9515–9518** silent `.catch(() => empty/fake-zero)` on banking/escrow/factoring **reads** (9517 write-side reclassify = fail-loud, still yours). | Do **not** build INV-10 (entity role parity) until owner lists which roles are entity-specific. INV-1 skip (weaker than INV-2). Detectors 6/10 = HOLD remainder. |
| **Codex** | Keep `/dispatch` leftover unique. **DSP-F7075** already on main. | Do not steal Override (CC-3). |
| **Cascade** | Unique FINDING only on **this** SHA. Do not re-file the same silent-catch class. Re-baseline Devin `VEND-F-*` vs what CC-3 already shipped. | No product PR. No poll. |
| **Devin** | STOP expanding the 11-row vendors list. Query-back after CC-3 Override + CC-1 G1 land. KEEP TEST. | No new post-gl. No 1099. |
| **Devin-A** | Reproduce Override dead click as **auditor** (not builder). Book Load KEEP. | Do not remake TESTs. |
| **Cursor** | Keep FEED files current every lead turn. Deploy only 5–10 + one in-flight. | Do not steal G1 or Override. |
