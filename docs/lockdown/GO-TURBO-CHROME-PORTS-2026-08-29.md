# GO-TURBO — Chrome / MCP debug ports
**Issued:** 2026-08-29 · **Law:** `docs/bus/CHROME-PORTS-LOCKED.md` (this table wins; ignore any board snippet that puts CC-1 on 9222)

## Do all coders need a Chrome browser?

**No — not for every task. Yes — for Live Chrome, and they must not share one browser.**

| Work | Chrome required? |
|---|---|
| T1 L6 stamps from Neon SQL + `GET`/`curl` + ancestor check | **No.** Recipe B. Do not wait on a browser. |
| Period close, GR-1 ratchet, guard re-anchor | **No** until a UI hop. |
| Live Chrome (Fully-Wired item 12), vendors “done”, customers chrome, matrix click-through, picker `+ Add new` | **Yes.** Own port. Own profile. MCP attached to **that** port only. |

**Open your browser now anyway** if your WAVE includes any Live Chrome this sprint (CC-2 vendors, CC-3 chrome wave, Codex dispatch UI, Cursor matrix, Devin customers if that seat is live). Do not steal another seat’s port.

**DEVIN-A remains VOID.** Do not open 9227 “for Devin-A.”

Live app: `https://app.ih35dispatch.com` · entity **USMCA**. Company switcher must show USMCA before any click you will cite as evidence. Live API SHA: `curl -s https://api.ih35dispatch.com/api/v1/healthz/shallow` — stamps only against that `version` (now `ecd3afd` until the next deploy).

## Port assignment — no deviation

| Seat | Port | `--user-data-dir` |
|---|---|---|
| **Cursor** | **9222** | `$HOME/.chrome-mcp-cursor` |
| **CC-1** | **9223** | `$HOME/.chrome-mcp-cc1` |
| **CC-2** | **9224** | `$HOME/.chrome-mcp-cc2` |
| **CC-3** | **9225** | `$HOME/.chrome-mcp-cc3` |
| **Codex** | **9226** | `$HOME/.chrome-mcp-codex` |
| **Cascade** | **9227** | `$HOME/.chrome-mcp-cascade` (audit Chrome only; do not take 9222–9226) |
| **Devin** (if seat is live, not Devin-A) | **9228** | `$HOME/.chrome-mcp-devin` |
| Spare | 9229 | `$HOME/.chrome-mcp-spare` · PREPEND OUTBOX `PORT=9229` |

If your port is dead: **start yours**. Never attach to a neighbor.

## Launch (macOS) — one command per seat

Copy **your** port and dir. Separate `user-data-dir` is mandatory. Two Chromes on one profile will collide and look like “MCP is broken.”

```bash
# example CC-2 — replace port + dir from the table
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9224 \
  --user-data-dir="$HOME/.chrome-mcp-cc2" \
  --no-first-run --no-default-browser-check \
  "https://app.ih35dispatch.com"
```

Linux: `google-chrome` or `chromium` with the same flags.

Prove the port is yours:

```bash
curl -sS "http://127.0.0.1:<YOUR_PORT>/json/version"
# must return webSocketDebuggerUrl. If connection refused, you did not start YOUR Chrome.
```

## MCP — attach to YOUR port, not the shared IDE tab

**Cursor seats:** Cursor browser MCP / CDP must target **`127.0.0.1:<YOUR_PORT>`**. Do not drive another agent’s window. After connect: list tabs, then work. Never reuse a tab id from a previous session.

**Claude / Codex seats:** connect the Chrome/CDP MCP (or Claude-in-Chrome) to **the instance you just launched**. If the tool only pairs via the Chrome extension: install it in **this** profile (`user-data-dir` above), click Connect once. If it cannot pair, **say so in OUTBOX** and continue Neon/HTTP work — do not loop.

**Forbidden:** one shared Chrome; `switch_browser` onto someone else’s session; Codex “no CDP” as an excuse when the WAVE is Live Chrome (open 9226).

## Session start checklist (every seat)

1. `curl -s https://api.ih35dispatch.com/api/v1/healthz/shallow` → record `LIVE_SHA`
2. If this WAVE needs clicks: launch Chrome on **your** port (table)
3. `curl http://127.0.0.1:<port>/json/version` → PASS
4. MCP attach to that port
5. Confirm USMCA in the app header
6. OUTBOX: `SEAT | PORT=<n> | LIVE_SHA=<sha> | CHROME=up|none-needed | GO`

## What does not need Chrome tonight

CC-1 Wave 1 money evidence (SQL + endpoints). Cascade Wave 1 `verify-static` re-measure. Cursor GR-1 ratchet. Codex/CC-1 stamp-only IDs that are HTTP/SQL only.

When that work is done, **then** Chrome for the last mile. Do not idle waiting for a browser on a Neon stamp.
