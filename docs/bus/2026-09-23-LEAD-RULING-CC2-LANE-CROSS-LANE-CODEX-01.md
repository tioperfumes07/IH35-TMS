# LEAD RULING — LANE-CODEX-01 (CC-2 lane cross on `scripts/verify-lane-ownership.mjs`)

Owner/Lead packet, verbatim (P0, two files):

> CC-2 — add CODEX as a seat. P0. Two files. It unblocks four finished branches.
>
> scripts/verify-lane-ownership.mjs only knows CC-1|CC-2|CC-3|LEAD|CURSOR.
> Add CODEX:
>   - branch matcher: else if (/^codex\//.test(branch.toLowerCase())) seat = 'CODEX';
>   - validator regex: /^(CC-[123]|LEAD|CURSOR|CODEX)$/
>   - add CODEX to the `others` array
>   - section header regex: (CC-[123]|LEAD|CURSOR|CODEX|SHARED|FORBIDDEN)
>
> docs/bus/LANES.md — add a "## CODEX" section listing his paths. Paths only,
> no sentences. Codex is sending you his own list.
>
> Do not weaken the guard, do not add a default seat. Just add CODEX.

This authorizes CC-2 to edit `scripts/verify-lane-ownership.mjs` (CC-1 lane) for the CODEX seat
identity resolution (branch matcher, validator regex, `others` array, section header regex only —
no other change to guard logic) and `docs/bus/LANES.md` (SHARED, `docs/**`, no cross needed) to
add a `## CODEX` section once Codex's own path list is received. Four Codex branches held pending
this fix: `e3d7949c4f`, `b3099ec66c`, `c35cfe28db`, `70c2d5845a`.
