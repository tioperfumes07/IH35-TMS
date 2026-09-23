# Owner Authorizations

ROUND 133 (owner law, P0): a production write is authorized ONLY by an OPEN, unexpired `AUTH-<NNN>`
entry in THIS file on `main` — see `docs/bus/00-CODER-START-HERE.md`'s top-of-file law for the full
text and `scripts/verify-owner-authorization.mjs` for the check every coder runs before executing.

Append-only. One entry per authorized production action. Newest entry last. Never edit a landed
entry's `issued_at` / `scope` / `action` / `expires_at` fields after it merges — only the `status`
line and the after-run consumption block (BUILD 4) are ever appended/changed, and only by the seat
that actually executed the action, immediately after execution.

Format, one block per authorization:

```
## AUTH-<NNN>
issued_at: <ISO UTC>
scope: <exact tables and company id>
action: <the exact SQL or the exact script + args, verbatim>
expires_at: <ISO UTC, max 24h after issued_at>
status: OPEN | CONSUMED | EXPIRED
```

After execution, the executing seat appends directly under that block:

```
consumed_at: <ISO UTC>
consumed_by: <seat name>
row_counts: <what actually changed, by number>
proof_query: <the exact query run to confirm the result, and its output>
```

---

<!-- No AUTH-<NNN> entries yet. The first one is issued by the owner merging a PR that adds one. -->
