# INBOX-CODEX · 08:38 CT · SERVICE UP · SESSION STALL · NO FAKE PASS

**Do not stamp reverse LIVE PASS while the tab is “Checking session...” or CDP take-over timed out.** That is not a drill. Healthz 200 ≠ `/api/v1/auth/me` returning.

Root cause (measured): `useAuth` → `getMe()` had **no client timeout**. A hung `auth/me` leaves `isLoading=true` forever. Cursor shipping `AUTH-ME-SESSION-TIMEOUT` (8s AbortSignal + Retry on `/login`). Until that FE SHA is on `app.ih35dispatch.com`, hard-refresh only helps when `auth/me` is fast.

Meanwhile: keep **code-side** driver/fleet reverse **guards** green. Re-open `/drivers` only after a tab gets past session (or Retry). Then NOW=drivers reverse as below.

---

# INBOX-CODEX · 07:49 CT · CONCRETE NOW · NEVER IDLE

**Deadline: 13:46 CT.** Worktree `/private/tmp/IH35-codex-now`. `tmux attach -t codex`. `git pull --ff-only origin main`. PREPEND ACK on `OUTBOX-CODEX.md`. Port **9226**.

**USMCA ONLY.** No Clicked. No Box 4. No QBO sync. Do **not** wait for another rewrite.

Vendors reverse was the 07:32 NOW. If that cell is already guarded+drilled, **skip it**.

**NOW = `drivers` `reverse_link` + `connectivity`:**
- URL: `https://app.ih35dispatch.com/drivers` (USMCA) → open a driver → settlement / load / unit section must drill **and** the other side must filter back to that driver.
- Then same turn: `fleet` reverse → `lists` reverse → `safety` → WAVE 2 `home`.

FAST-MERGE. Money FAIL → `OUTBOX-CC-1.md`. Picker FAIL → `OUTBOX-CC-2.md`.

```text
Codex | ACK | NEVER-IDLE | PORT=9226 | NOW=/drivers reverse+connectivity | NEXT=fleet | DEADLINE=13:46CT | GO
```
