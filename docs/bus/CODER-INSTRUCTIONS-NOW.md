# CODER INSTRUCTIONS NOW · 2026-08-21 17:39 CT

**Your only order is your INBOX file.** `git pull --ff-only origin main`. **FAST-MERGE 4–5 min.** Never HOLD. Never `/tasks`. USMCA only.

**Owner: FIX the 502 storm + CERTIFY Urgent 6 RIGHT NOW**, then rest of urgent. Vertical.

## HARD — every seat (read before you code)

1. **Do NOT call Render deploy.** No `trigger_deploy`, no `render deploys create`, no Dashboard Deploy, no MCP deploy, no “kick ih35-tms because SHA lags.” Law: `docs/lockdown/NO-PER-MERGE-PROD-DEPLOY-LAW-2026-08-21.md`.
2. **Do NOT buy Render storage / upgrade the plan.** Measured: Pro, 2 instances, CPU ~40% of limit, RAM ~25% of 4GB. 502 = overlapping deploys (~3 min each), not disk.
3. **Merge every 4–5 min is allowed. Deploy is not in that loop.** One prod deploy every 30–60 min, Cursor lead only, and only when the previous deploy is **live** AND `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` is JSON `{ok:true,version}`.
4. **Native `window.confirm/alert/prompt` freeze Chrome.** Use `ConfirmModal` / `VoidReasonModal`. Do not click Void/Revoke/Disconnect until that surface is in-app.
5. **USMCA only.** No QBO write-back. No Trucking / Transportation work.

| Seat | File | NOW (do this, nothing else) |
|------|------|------------------------------|
| **CC-1** | `INBOX-CC-1.md` | U6 **money**: accounting→banking→settlements→factoring→dispatch→vendors. Settlement **close** TEST DATA if 0 closed. Reuse poster. **No Render kick.** |
| **CC-2** | `INBOX-CC-2.md` | U6 **Live stamp** in this order while healthz JSON 200. **If healthz 502 HTML: do not deploy — wait, work next unpaid cell that does not need API.** Never kick Render. |
| **CC-3** | `INBOX-CC-3.md` | U6 **picker_law + trailer + Save→reload**. Drain remaining `window.confirm/prompt` on U6 surfaces. **No Render kick.** |
| **Codex** | `INBOX-CODEX.md` | U6 **reverse_link → customer → vendor → load**. Code reverse only. **No Render kick. No Chrome CDP.** |
| **Cursor** | `INBOX-CURSOR.md` | Bus + **live certify** U6 then customers→drivers→fleet→lists. Native-dialog freeze PR. **Only seat that may batch-deploy, and not until 30–60 min / owner demand / previous live.** |

THEN rest of urgent: customers → drivers → fleet → lists. **Not WAVE2 until U6 certified.**

**Dashboard (whoever has Render UI, do not click Deploy after):** Pre-Deploy must be only `npm run db:migrate && npm run db:verify:critical-runtime`. Strip `ci:boot-api-smoke` / `ci:boot-aggregate-smoke` (those stay in GitHub CI). Live dashboard still had them 2026-08-21 17:36 CT.
