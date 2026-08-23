# CASCADE + DEVIN — CERTIFIED U14 AUDIT PACK (owner 2026-08-23)

**Lane:** audit-only. **Not** a 15th Urgent-14 plan. **Do not** steal OPEN prefixes (`/lists` `/legal` `/customers` `/drivers` `/fleet`). **Do not** recertify. **Do not** `trigger_deploy`. **Do not** remake proven TESTs / Close / Book Load.

Jorge ordered: audit **already CERTIFIED** Urgent-14 modules completely, stay current with repo + live SHA, finish scenario trackers if the module’s tracker is incomplete.

---

## 0. Repo / folder / files (be current first)

| Item | Value |
|------|--------|
| GitHub | `tioperfumes07/IH35-TMS` |
| Clone / worktree | `/Users/jorgemunoz/IH35-TMS-clean` (or your assigned worktree of the **same** remote) |
| Branch | `main` only for audit reads. Feature branch only if you ship a unique FINDING (500 / dead click / silent no-op) |
| App | `https://app.ih35dispatch.com` |
| API | `https://api.ih35dispatch.com` |
| Live SHA | `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version` |
| USMCA opco | `5c854333-6ea5-4faa-af31-67cb272fef80` |
| Neon | project `tiny-field-89581227` · prod branch wins · RLS 0 ≠ absence |

**Pull every session:**

```bash
cd /Users/jorgemunoz/IH35-TMS-clean   # or your worktree
git fetch origin
git checkout main
git pull --ff-only origin main
curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow
git rev-parse --short origin/main
```

If healthz `version` ≠ `origin/main` short SHA: **audit against live anyway**, mark `LIVE_SHA_LAG=<healthz> vs MAIN=<short>`. Do not wait idle. Do not kick Render (Cursor lead only).

---

## 1. Law files (read before clicking)

Must-read (in order):

1. `docs/lockdown/URGENT-14-EXCLUSIVE-MODULE-CERTIFY-LAW-2026-08-22.md` — Status table (CERTIFIED vs OPEN)
2. `docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md` — items **1–12**
3. `docs/lockdown/CREATE-TEST-THEN-VOID-LAW-2026-08-22.md`
4. `docs/lockdown/NO-PER-MERGE-PROD-DEPLOY-LAW-2026-08-21.md`
5. `docs/bus/FAST-MERGE-4MIN-LAW.md`
6. `docs/audit/IH35-FULL-SYSTEM-AUDIT-SPEC.md` — DoD A–E + VERIFY 1–8
7. This pack
8. Scenario folder: `docs/audit/scenario-trackers/certified-u14/`

Chrome law / design: `docs/specs/IH35_ARCHITECTURAL_DESIGN.md` for tab counts on the module you audit.

INBOX (your order): `docs/bus/INBOX-CASCADE.md` or `docs/bus/INBOX-DEVIN.md` · `docs/bus/INBOX-DEVIN-A.md`

OUTBOX: `docs/bus/OUTBOX-CASCADE.md` · `docs/bus/OUTBOX-DEVIN.md` (create prepend-only if missing)

---

## 2. Split (no collision)

Historical CERTIFIED SHAs may be **older** than live healthz. That is expected. Audit = **re-walk Fully-Wired 1–12 on current live**. Outcome is `AUDIT-PASS` or unique FINDING. Outcome is **not** a new CERTIFIED stamp (Cursor owns the table).

| Seat | Port (if CDP) | CERTIFIED modules to audit | URLs (do not leave this list) |
|------|---------------|----------------------------|-------------------------------|
| **Cascade** | 9227 if assigned | 1 accounting · 2 banking · 3 settlements · 4 factoring · 5 dispatch | `/accounting` `/banking` `/driver-finance` `/settlements` `/cash-advances` `/factoring` `/dispatch` |
| **Devin** | assigned | 6 vendors · 11 maintenance · 12 safety · 13 insurance | `/vendors` `/maintenance` `/safety` `/insurance` |
| **Devin-A** | assigned | Scenario trackers **only** (no live prefix steal) | Write/finish files under `docs/audit/scenario-trackers/certified-u14/` from Cascade/Devin OUTBOX evidence. If a tracker needs a live hop Devin-A does not have, ping that seat’s OUTBOX — do not open CC-3/Codex prefixes. |

Empty unique-FINDING on your next module → next row in **your** column. After your column is done → leftover `docs/lockdown/POST-URGENT-14-MODULE-SEQUENCE-2026-08-23.md` first **unclaimed** row. **Never idle.**

---

## 3. Per-module audit procedure (one module at a time)

Copy `docs/audit/scenario-trackers/certified-u14/TEMPLATE.md` → `U14-<nn>-<module>.md`.

For each module:

1. Re-curl healthz. Write `LIVE_SHA=` in the tracker.
2. Walk Fully-Wired **1–12** (Chrome for Cascade/Devin). Codex-style SQL allowed as **supporting** evidence, not a substitute for Live Chrome on these CERTIFIED UI modules.
3. VERIFY 1–8 from `IH35-FULL-SYSTEM-AUDIT-SPEC.md` where applicable (picker `+ Add new` first row, reverse drill, RLS).
4. **Do not remake** Close / Book Load / labeled TESTs. Use existing TESTs. CREATE-TEST-THEN-VOID only if a hop is blocked by empty TMS **after** you looked for an existing TEST.
5. Banking: TEST expense → Match → recon Accept. Do not drain For-review.
6. Verdict:
   - `AUDIT-PASS | MODULE=<id> | LIVE_SHA=<healthz>` if 1–12 honest on **this** SHA
   - unique FINDING only for 500 / dead click / silent no-op → FAST-MERGE a fix in-lane **or** write `docs/audit/GUARD-WORKORDERS.md` OPEN row if another lane owns money
7. Prepend OUTBOX one line. Next module same turn.

Forbidden: HOLD · recertify · occupy OPEN U14 prefixes · wait for Jorge · CI watch · second Render deploy.

---

## 4. Scenario trackers

Canonical product spec (pixel / live dots): `docs/specs/scenario-tracker/IH35-SCENARIO-TRACKER-BUILD-SPEC-2026-08-05.md`  
In-app: `/home` scenario tracker (do not claim product complete here).

**This audit’s trackers** are the markdown files in `docs/audit/scenario-trackers/certified-u14/`. Fill every section. If the in-app tracker card for that process is red/missing, record it in the markdown; fix only if it is a unique 500/dead/silent on **your** assigned URL. Otherwise remaining line + continue.

FAST-MERGE tracker completions (docs-only): gate N/A docs → PR → `gh pr merge --squash --delete-branch --admin` same turn.

---

## 5. ACK lines

`Cascade | ACK | CERTIFIED-U14-AUDIT | NOW=/accounting | GO`  
`Devin | ACK | CERTIFIED-U14-AUDIT | NOW=/vendors | GO`  
`Devin-A | ACK | CERTIFIED-U14-TRACKERS | NOW=docs/audit/scenario-trackers/certified-u14/ | GO`
