# DEEP-DIVE UNIQUE HUNT — CODER INSTRUCTIONS (owner 2026-08-24)

**This is the order.** Every seat (Cursor, CC-1, CC-2, CC-3, Codex) and both auditors (Cascade, Devin-A) work from this file + `docs/bus/INBOX-<SEAT>.md` TOP. Do not invent a 15th certify campaign. Do not wait for Jorge.

**Goal Jorge named:** dive deep, fix, audit, make it **perfect** — meaning **zero unique defects** on live USMCA, not a restamp theater.

Canonical companions (do not replace this hunt):

- `docs/lockdown/CERTIFIED-MEANS-ZERO-UNIQUE-LEFTOVER-LAW-2026-08-24.md`
- `docs/lockdown/LAUNCH-READY-UNIQUE-REMAINDER-2026-08-24.md`
- `docs/lockdown/POST-URGENT-14-MODULE-SEQUENCE-2026-08-23.md`
- `docs/lockdown/CREATE-TEST-THEN-VOID-LAW-2026-08-22.md`
- `docs/bus/NOW-ONE-SOURCE.md`
- Fully-Wired 1–12: `docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md`

---

## CURRENT-LAW (every hop)

- USMCA only. No TRANSP. No TRK. No TMS→QBO write-back.
- **U14 14/14 CERTIFIED. Never restamp. Never recertify. Never a 1–12 Live Chrome campaign on the 14.**
- Leftover POST modules already have Live Chrome stamps. **Do not recertify them.** Hunt **unique** leftovers only.
- `/425c` do not loop.
- FAST-MERGE ~4 min. Never `gh pr checks --watch`. Cursor deploys every **5–10 min AND 5–10 PRs**, one in-flight. CC never `trigger_deploy`.
- CREATE-TEST-THEN-VOID. Empty TMS is expected. Posting flags OFF until Jorge says turn on = honest, not a FINDING.
- HOLD / idle / “no instructions” = defect. You have this file.

ACK: `SEAT | ACK | DEEP-DIVE-HUNT | PORT=n | NOW=<url> | GO`

---

## WHAT “PERFECT” MEANS (and what it does not)

**Perfect = on current `healthz/shallow` `version`, your assigned URLs have:**

1. No **500** (API or page) from a click a dispatcher/accountant would actually make.
2. No **dead click** (control looks live, nothing happens).
3. No **silent no-op** (save/send/apply returns 2xx or UI success while nothing persisted).
4. No **reverse-empty** (Neon has in-scope rows, UI shows 0 / blank as if none exist).
5. Failures are **loud and honest** (error banner / 4xx/5xx / “Unavailable”) — never fake **$0**, fake empty, or fake 404 that hides a DB error.

**Not a FINDING (do not file, do not “fix” by inventing data):**

- Empty lists after you tried CREATE-TEST-THEN-VOID and the wizard works.
- Posting / QBO flags OFF (Finance Hub honest flag-off).
- ELD hidden stub. `/425c` already walked.
- Historical import rows with no load FK (`docs/lockdown/LOAD-LINKAGE-SCOPE-RULING-2026-08-04.md`).
- Re-proving a grep-closed FINDING (`account_mask`, EventSource `resolveApiUrl`, etc.).
- Recertifying U14 or leftover POST stamps.

---

## HOW TO DIVE DEEP (every seat, every URL, same method)

Do **all four layers** before you say “clean.” Code-only or Chrome-only is incomplete.

### 1) Live Chrome (required)

1. `curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow` → record `version`.
2. Open **your** URL on that SHA (not a stale tab).
3. Click **every** primary control: tabs, row open, + Create / + Book, Save, filters, print, overflow menus, linked IDs.
4. If the list is empty: **CREATE a labeled TEST** (`TEST-<SEAT>-<DATE>`), prove persist + reload, then owner voids later. Disabled Save after you created the prerequisite row is a FINDING; disabled Save because you never created the row is not.
5. Watch Network: click that does not fire a request = dead/silent until proven otherwise.
6. Screenshot only the unique defect (URL + SHA + status). Do not screenshot “empty is fine.”

### 2) Repo hunt (same turn, before or with Chrome)

Grep **your module tree** for these classes (fix if still true vs `origin/main`):

```text
.catch(() => ({ rows: []
.catch(() => ({ rows: [{ ... 0
.catch(() => null)
.catch(() => ({ spend: 0
onClick={() => {}}
href="#"
preventDefault()  with no navigate / mutate
TODO.*click|noop|not implemented
ComingSoon|not yet built
```

Also: route registered in the router **and** mounted in the page the sidebar opens. A file existing is not wired.

### 3) Neon (money / reverse-empty only)

If the UI shows $0 or 0 rows on a money/ops list:

- Re-read **same table** with `SET app.operating_company_id` (USMCA) and, if still 0, completeness discriminator (`visible == n_live_tup`, `current_user` in-statement). Bypass on table A does not prove table B.
- Classify origin: QBO clone / import vs TMS-native. Import-unlink is EXPECTED. TMS-native missing FK after a live create is a FINDING.

### 4) Ship

- One unique FINDING per PR. Root cause, not a banner.
- Extend an **existing** `scripts/verify-*.mjs` + its **already-claimed** verify-step. **Do not** add `verify-steps/NNNN` until NNNN is on `origin/main` CLAIMED (Cursor EVEN). **Do not** edit `CLAIMED-NUMBERS.json` in the feature PR.
- Claude-green body. `cursor-ship-preflight --body-file`. FAST-MERGE.
- OUTBOX one line: FINDING id · PR · SHA · next URL on **your** list.
- Immediately start the next unique. Never idle.

---

## SEAT MAP (do not steal URLs)

| Seat | Port | Dive these URLs (unique leftover only) |
|------|------|----------------------------------------|
| **Cursor** | 9222 | Lead + overflow unique anywhere. Merge. Deploy cadence. Customers money tabs if still unique. |
| **CC-1** | 9223 | `/accounting` `/banking` `/customers` `/vendors` `/factoring` `/settlements` — money 500/dead/silent/fake-$0 |
| **CC-2** | 9224 | `/cash-flow` `/reports` `/tasks` — fake-$0 catches, dead report runs, silent task actions |
| **CC-3** | 9225 | leftover-16 chrome: `/help` `/program` `/system` `/inventory` `/users` `/docs` `/home` |
| **Codex** | 9226 | `/drivers` `/fleet` `/safety` `/insurance` `/maintenance` `/fuel` — unique only; no U14 restamp |
| **Cascade** | audit | Live-walk assigned money URLs. File unique FINDING if still true. **No product PRs.** |
| **Devin-A** | audit | `/customers` 3 money tabs + `/vendors` + `/dispatch`. Corroborate. **Not PARKED.** |

Forbidden remakes: Close / F6301 / fleet #15291–#15310 / fuel phantom #15335 / `/425c` loop / roadside CLASS-F5973 exhausted leaves.

---

## AUDITORS (Cascade / Devin-A)

- Walk live. Write a **unique** FINDING (repro + SHA + URL + what Neon/network showed) or **AUDIT-PASS** for that surface this SHA.
- Do not restamp CERTIFIED. Do not open product PRs. Coders fix from the board/INBOX.

---

## CURSOR LEAD

- Keep INBOX TOP = this hunt. Fan unique FINDINGS to the owning seat the same turn.
- FAST-MERGE green local gate. Deploy 5–10 min **and** 5–10 PRs, one in-flight.
- Never tell Jorge to merge, deploy, or relay a message to another seat.

---

## DONE FOR A URL THIS SHA

OUTBOX: `SEAT | HUNT-PASS | URL=... | SHA=<healthz> | unique=none | next=...`

If unique found: `SEAT | FINDING | ID=... | URL=... | SHA=... | PR=#n | next=...`

Do not write CERTIFIED on U14 or leftover POST. Hunt-pass ≠ recertify.
