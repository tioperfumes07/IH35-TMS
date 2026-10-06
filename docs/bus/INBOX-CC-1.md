# INBOX-CC-1 — Claude Lead · written 2026-10-06

READ THIS FILE AT THE START OF EVERY ROUND. The Lead writes here directly; the owner does
not paste orders any more. If it is not in this file or in your OUTBOX, it was not ordered.

RULE: write every result to docs/bus/OUTBOX-CC-1.md. The Lead reads the bus from origin/main.
If it is not in the bus, it did not happen and the Lead cannot see it.

## YOUR OPEN ORDERS — full text in these files, same content, both locations:

  ~/Downloads/10-06-2026-CC-1-MONEY-ENGINES-NOW.md
  ~/Downloads/10-06-2026-CC-1-VISUAL-CLOSEOUT.md
  ~/Downloads/10-06-2026-ALL-SEATS-VISUAL-CLOSEOUT-PALETTE-TOKENS.md

CC-1 — MONEY ENGINES, GL LANE · ROUND 432-CC1
Owner order 2026-10-06: all money engines fixed now. Deadline 2026-10-06 20:00 Laredo (2026-10-07 01:00Z).
CI is down account-wide. Local gates ARE the record. Say so in every PR body; never claim a CI check.

YOUR LANE: the general ledger and the posters. Five items, in this order.

1. 393.1 — A/P WRITE-TIME RULE. GL 2000 holds $3,542.98 against $566.35 of open bills; 60 lines
   totalling $2,976.63 are all source='auto', all typed journal_entry, none with a bill, and their
   source expenses no longer exist. Build the write-time refusal on the ap_control account FIRST,
   then reverse by document. NO correcting entry. This must exist before anything is re-created.

2. 363-CC1-A — journal_entry_postings.load_id written by EVERY poster, not some. Enumerate the
   posters, prove each writes it, and make the database refuse a load-born posting with a NULL load.

3. 363-CC1-B — bill-payment COMMIT refusal, then post the 130.

4. 394 — driver advances to the driver's own 1245 sub-account; the payable stays in 2170
   ($71,215.96). Prove the pair nets.

5. 365.6 — main green on the 31 live guards, measured WITH a credential. This is the purge gate and
   nobody else can clear it.

ALSO YOURS, FROM MY MEASUREMENT TODAY:
- THE SPINE. 11,518 postings, 7,957 transaction_source_links, 3,938 postings with NO link. r391
  fixed the writer so new postings carry the link; the 3,938 detached ones have no backfill. The
  purge walks the spine, so a detached posting is invisible to that walk. CC-2 proved 3,908 of them
  name documents that no longer exist (3,908 DELETEs on transaction_source_links in the AUTH-177
  window, 2026-09-30 17:19:10–17:28:12Z, ledger effect 0). What I need from you is ONE number: of the
  3,938, how many name a document that STILL EXISTS. That set, and only that set, is a real backfill.
  Report the count before writing anything.

DO NOT
- Do not write a correcting entry for the A/P difference. Reverse by document.
- Do not backfill a spine link for a posting whose document is gone. That is purge scope.
- Do not raise any guard baseline to pass. A baseline that grows is a defect filed as policy.

DONE LINE, per item: PR number · squash sha · deploy id + deployed sha · the live query and its
pasted result · which guard proves it and its PASS line verbatim.
CC-1 — VISUAL CLOSEOUT: THE PALETTE, THE BREADCRUMB, THE STRANDED SUB-NAV · ROUND 433-CC1
Owner 2026-10-06: close every visual item. Deadline 2026-10-07 20:00 Laredo.
STILL LANDS TODAY FIRST: 393.1 A/P write-time rule, and the ONE spine number I asked for (of the
3,938 detached postings, how many name a document that still exists). Those are already in flight —
finish them, then take this.
Read 10-06-2026-ALL-SEATS-VISUAL-CLOSEOUT-PALETTE-TOKENS.md. The hexes are pinned there; do not
invent one.

1. THE PALETTE, ONE PR. Owner, 10-03: "the white is too white and surfaces get lost… unselected is
   plain white and must become a different tone." Selected (blue + white text) is correct and does not
   change. `verify-section7-palette-financial` is green at 7 off-palette classes, FROZEN — so the
   tokens file and that guard's baseline change TOGETHER in one commit, never per component, or the
   guard will reject every seat's next PR. Ship:
   - the tokens in apps/frontend/src/design/tokens.ts + matching CSS custom properties
   - every unselected box / toggle / segment reading --surface-unselected, not white
   - the guard baseline updated with the reason written in the commit, not an allowlist
   This PR touches many files and no logic. Keep it mechanical and reviewable.

2. BREADCRUMB APP-WIDE — U18. Measured: `Breadcrumb` appears in 11 of 1,222 page files. Devin already
   fixed two routes that used history-back instead of a structural parent
   (SafetyLayout, NotificationPreferencesPage) and his guard reports 542/542 routes have a structural
   parent. So the DATA is there and the COMPONENT is not rendered. Mount it. Report the count moved.

3. THE STRANDED SUB-NAV — C6 / ROUND 385. Load costs, Vendors and Customers come OUT of the
   Accounting sub-nav, and "Maintenance & shop" becomes "Work orders & bills". This was built in
   ~/ih35-lead and never merged — it does not exist on main. Rebuild it on a pushable branch.

DO NOT
- Do not ship the tokens without the guard baseline in the same commit.
- Do not let the palette PR carry a logic change. One job per PR.

DONE LINE per item: PR number · squash sha · deploy id + deployed sha · for the breadcrumb, the
before/after file count · the guard PASS line verbatim.
