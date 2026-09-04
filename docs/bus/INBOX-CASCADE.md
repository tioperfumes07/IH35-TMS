# INBOX-CASCADE · 2026-09-03 20:42 CT
`git pull --ff-only origin main`

NOW: Ship BRD-01..12 as **one** PR. Then BRD-13 (list view inner section headers).

PUSH: `cursor-ship-preflight --body-file` must PASS. Then `--no-verify` **only** for ENV-VERIFY-STATIC class.
`verify-ui-regressions.mjs` “Dispatch pre-settlements tab missing” is **your** guard — not ENV. BRD-01 removes the **duplicate tab row**, not the pre-settlements surface. Restore that tab (or the guard’s required label) then push.

Do not open a PR without a push. Do not wait on Jorge. Use `gh api …/pulls/N/merge` — `gh pr merge` breaks when `main` is in another worktree.

Never POST. Never Chrome. Do not edit Book Load wizard files.

ACK `CASCADE | ACK | fix pre-settlements guard · ship BRD · NEVER POST | GO`
