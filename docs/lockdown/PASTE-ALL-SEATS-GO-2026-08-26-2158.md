# GO-2158 — DEVIN VENDORS RE-VERIFY ROUTED · LIVE `e3ae7a7` · 2026-08-26 21:58 CT

**THIS IS NOW.** GO-2136 still law. This packet **routes Devin’s dd54885 re-verify** to the correct builders. Do not restamp U14. Skip #15546. Nobody except Cursor `trigger_deploy`.

**Live:** `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → **`e3ae7a7`** (GO-2136 just landed; uptime ~minutes). **Hard-reload.** Do **not** poll `dd54885`. Do **not** kick another deploy this hour (5–10 min / 5–10 PR gate; one in-flight just finished).

ACK OUTBOX first line:

`SEAT | ACK | GO-2158 | PORT=n | NOW=<id> | SHA=e3ae7a7 | GO`

---

## Devin `/vendors` on dd54885 — who owns what

| Finding | Owner | Action |
|---------|--------|--------|
| `MDATA-DEACTIVATE-RLS-500` | CC-3 already #16433 | **FIXED** (POST 200). Devin: re-prove on **`e3ae7a7`**. Do not remake. |
| `VENDOR-REACTIVATE-PATCH-404-RLS-HIDES-DEACTIVATED` | **CC-3 NOW** | **OPEN unique leftover.** Reactivate = PATCH `{deactivated_at:null}` → RLS hides deactivated row → 404 `mdata_vendor_not_found` → **silent dead click**. Same class as deactivate: wrap the **reactivate UPDATE** in `withLuciaBypass()` + entity `operating_company_id` predicate (deactivate POST already does this; generic PATCH does not). Toast on 404. TEST vendor `63a9a2d1-caaf-4e2d-a923-318619213064` void at launch. **CC-3 builds. Devin does not PATCH-fix. Devin does not steal `/compliance`.** |
| `VENDOR-SAFER-VERIFY-MISSING-OPCO-ID` | Cursor #16401 **merged** `b33944a` | Re-verify on **`e3ae7a7`** (was 400 on dd54885 because **not deployed**). If still 400 after hard-reload → OUTBOX-CURSOR. |
| `VENDOR-SAFER-STATUS-WRONG-ENDPOINT` | CC-3 after reactivate | Unique leftover if still true on `e3ae7a7`. |
| Maintenance integrity history 404 | none | **Expected** empty vendor — not a FINDING. |
| “Payment — not visible” / expense labels | not this hop | Display class, not 500/dead/silent. Do not file as NOW. |

**Devin git (HARD):** clone `IH35-TMS-devin-a-audit` **diverged**. Do **not** rebase 18 OUTBOX commits. `git fetch origin && git reset --hard origin/main` then prepend **one** ACK line to `docs/bus/OUTBOX-DEVIN.md` and FAST-MERGE that file only. Idle = live-walk `/vendors` on **`e3ae7a7`**, not healthz poll loops.

---

## YOUR NOW

| Seat | NOW |
|------|-----|
| **Devin** | ACK GO-2158. Hard-reload **`e3ae7a7`**. `/vendors` only. Re-click Reactivate + Verify SAFER. OUTBOX first line. No deploy. No `/dispatch`. |
| **CC-3** | **NOW=`VENDOR-REACTIVATE-PATCH-404-RLS-HIDES-DEACTIVATED`** (API, not Devin Chrome). Then `/compliance` unique. Do not remake deactivate 500. |
| **CC-1** | Escrow residual then DEADHEAD then `VENDOR-OPEN-BALANCE-INCLUDES-DRAFT-BILLS`. Prove USMCA flags ON. |
| **CC-2** | `VOID-REVERSAL-REPORT-PAYLOAD-SUBJECT-TYPE-VOCABULARY-MISMATCH`. Never GL. |
| **Codex** | Next unique drivers/fleet/safety/fuel. cwd=`~/IH35-TMS-codex-seat`. |
| **Cascade** | `/dispatch`+`/driver-hub` unique only. |
| **Cursor** | Lead. Next deploy after 5–10 min **and** 5–10 PRs (main has commits after `e3ae7a7` — wait the gate). Overflow `/home` `/help` `/users` `/docs` `/inventory`. |

**3-hour launch (honest):** U14 **14/14 CERTIFIED — never recertify.** Work = unique leftovers (this reactivate is one) + leftover POST modules unique FINDING. Launch = Fully-Wired 1–12 + Live Chrome on **current** healthz + **zero unique OPEN**. CI-green ≠ launch.
