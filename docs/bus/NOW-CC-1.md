# NOW-CC-1 — archived 2026-09-25 (size-cap trim #3, CC-1 self-performed, WORM). Full prior history:
`docs/bus/archive/NOW-CC-1-2026-09-25-3.md` (includes ROUND 155 source map pointer + full ROUND
153.7/154.2 text).

# DECISION NEEDED — CC-1, 2026-09-25 4:35 AM CT (09:35Z), item 6 (self-carried invoices)
4 of the 5 self-carried invoices (009 FLS $525.00, 010 Supply Chain Mgmt $4,000.00, 026 IM Specialized
$87.40, 074 Alligator $4,800.00 — $9,412.40 total, of the $12,592.40 item-6 target) have no TMS
dispatch record (checked against `01-ENGINES/feed_input.json`'s 124 AlwaysTrack-sourced records and
the settlement PDF corpus — none exists). Each must be a load-less `accounting.invoices` row
(`source_load_id NULL`), a real, schema- and route-supported shape (`source_load_id` is optional in
both the DB and `createBodySchema`). Built and rehearsed the full writer
(`scripts/ops/2026-09-25-cc1-r153-item6-self-carried-invoices.ts`, PR #22577, merged 46fb80ad4b) —
but `sendDraftInvoice` (`apps/backend/src/accounting/invoice-send.service.ts`) refuses to send it:
```
evidenceReason = current.source_load_id ? (...) : "no_source_load";
if (evidenceReason) {
  const enforce = await isEnabled(client, DELIVERY_EVIDENCE_FLAG, { operating_company_id });
  if (enforce) return { ok:false, code:409, error:"delivery_evidence_missing",
    message: "This invoice is not linked to a load, so the system holds no delivery evidence for it.
               Link the load it bills, or send it manually after confirming delivery by another means." };
```
`INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE` is live ON for USMCA (`lib.feature_flag_overrides`,
`operating_company_id=5c854333-...`, `enabled=true`, no expiry) — confirmed on a Neon rehearsal
branch, twice. The `/send` route accepts only `mode` (`live_feed`|`historical_backfill`); the
`historical_backfill` branch only helps when `source_load_id` is already set. **There is no override
parameter anywhere in the real write path for a genuinely load-less historical document.**
**Asking:** (a) a scoped, named flag exception for these 4 specific historical self-carried invoices
(owner/Lead decision, not mine to grant unilaterally), or (b) a different sanctioned path I'm missing.
Not routing around it by hand-setting `status='sent'` or disabling the flag myself. Continuing items
7-11 while this is open, per "no seat goes idle."

CC-1 | 2026-09-25 4:35 AM CT (09:35Z) | R-153.5/6 DONE | item5 9ad7910f3f (PR #22574) | item6 46fb80ad4b (PR #22577, 1 of 5 fixed, 4 of 5 DECISION NEEDED above) | fuel untouched (CC-2's). Moving to items 7-11 per R-153.7/ROUND 155.

CC-1 | 2026-09-25 4:52 AM CT (09:52Z) | R-153.7 DONE | item7 96a6bc797d (PR #22581) | audited all 124 feed_input.json loads vs signed AlwaysTrack docs: 104/124 tie to the cent, 19 correctly absent (item 1's set + 8 more never-fed pre-Faro TRANSP loads on the same named documents), 1 real finding named not guessed at (load 13524, settlement says $4,200.00 but live invoice + Faro's own purchase both agree $3,800.00). Also fixed, same session: ROUND 133 P0 self-violation on my own item2/item6 scripts.ops writers — Codex's PR #22579 landed the code fix, I added the honest AUTH-001 retroactive transparency record (PR #22580, docs-only). Now on item 8 (cash advances as bill payments).

CC-1 | 2026-09-25 5:12 AM CT (10:12Z) | R-153.8 DONE | item8 9149658779 (PR #22586) | rehearsed on Neon FIRST and caught a real double-post before it hit production (7 advances' GL already existed from earlier backfill work) plus a separate, real, already-LIVE duplicate (CA-2026-0008+0009 duplicating CA-2026-0007's $201.99, same driver/load). Fixed: 7 rows status-synced to 'disbursed' (0 new JE), one correcting JE for the duplicate ($201.99), 2 rows reversed. AUTH-002 (abandoned plan) left to expire unused; AUTH-003 consumed with proof. REMAINING (named, not fixed): settlement 5769's own posted JE credits 1245 $201.99 with no backing cash-advance line in its signed document — item 10's or a follow-up. Now on item 9 (chart of accounts per posting).
