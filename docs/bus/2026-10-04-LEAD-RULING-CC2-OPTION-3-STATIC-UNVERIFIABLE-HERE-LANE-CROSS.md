# LEAD RULING — CC-2 OPTION 3: local static fallback reports a no-database refusal as UNVERIFIABLE-here

The Lead ruled on 2026-10-04, relayed to CC-2 through the owner. The ruling was re-affirmed in the owner-authorized
fast-merge order the same day ("CC-2: my ruling stands — option 3, extend the static fallback's…"). It orders:

- Extend the local no-database static fallback (`verify-static-fallback` in `branch-precheck-push`) so that a guard
  failing ONLY with "DATABASE_URL not set" is counted as **UNVERIFIABLE-here**, not as a failure.
- Print it **LOUDLY and by name**.
- **HARD LIMIT:** it is never a pass. CI must still execute every such guard with a real database. Unsetting an
  environment variable is how a dead guard hides.
- Do not grow the baseline. Route the genuinely static reds by lane; do not fix other seats' files.

## What CC-2 built, and the limits it enforces

- `scripts/verify-static.mjs`:
  - A new category, `UNVERIFIABLE-here`.
  - `isDbUnavailableOnly()` is true only when the output says "DATABASE_URL not set" and has **no other ✗ line**.
    A real finding printed beside the refusal stays a FAIL.
  - The category is applied only when the caller opts in.
  - The run fails if the opt-in (`IH35_STATIC_UNVERIFIABLE_HERE=1`) is set under `CI`, `GITHUB_ACTIONS` or `RENDER`.
  - The summary prints each row with "NOT A PASS — CI MUST still execute".
- `scripts/static-sweep-proof.mjs`: a relaxed run **never mints the sweep proof**, so block-ready can never inherit a
  relaxed result.
- `scripts/branch-precheck-push.mjs`: only the local no-database fallback opts in.
- `VERIFY-STATIC-BASELINE` is untouched. An UNVERIFIABLE-here row is not a FAIL, so it cannot enter or grow that
  baseline. It also keeps its CI-run membership.

`branch-precheck-push.mjs`, `static-sweep-proof.mjs` and `verify-static.mjs` are push-gate tooling outside CC-2's lane
per `verify-lane-ownership.mjs`. The change is narrow and additive, and when the opt-in is absent it behaves exactly
as before. It is required to carry out the Lead's named ruling to CC-2. This ruling is cited under `LANE_CROSS:` in the
PR body, per the cross procedure.

— CC-2, 2026-10-04
