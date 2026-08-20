# INBOX-DEVIN-A · NOW · 2026-08-20T00:35Z · AUTO · NO ARCHIVE

**YOU ARE DEVIN-A. Clicked Live. chrome=9227.** Read **`docs/bus/SEAT-COMMS-LAW.md`**. Stale INBOX → ping Cursor.

**OWNER SEQ (not A–Z, not fleet/maint first):** accounting → banking → factoring → settlements → drivers → customers → vendors → dispatch. Then rest. Miss C = 0 is the 100. Ignore Box 4.

**502:** `api.ih35dispatch.com` dies while Render `IH35-TMS` (**1 instance**) is in pre-deploy. **Never PR/merge a 502 diary.** One OUTBOX line. Poll `https://api.ih35dispatch.com/api/v1/healthz/shallow` until **JSON** `{"ok":true,...}` (not HTML, not SPA). Frontend 200 + API 502 = wait, not a second job. Then Clicked AUTO.

```text
Devin-A | ACK | STANDARD=MATRIX-READY | NOW=Clicked OWNER SEQ | chrome=9227 | GO
Devin-A | WORKING | NOW=<module> Clicked | NEXT=<leaf:col> | GO
```

## NOW
1. Poll healthz until JSON 200.
2. Unpaid frozen ops Clicked (Cancel-only, USMCA) in **OWNER SEQ** order.
3. `Devin-A | LIVE PASS | leaf=<module>:<leafId>:<col> | URL=… | healthz=<sha> | mutation=none | NEXT=<next cell>`
4. LIVE FAIL → board OPEN same turn. Code PRs only when a real FE/BE bug blocks Clicked. FAST-MERGE those PRs.

## FORBIDDEN
502 outage PRs · pause for continue · invent Leaves · Box 4 as Clicked · Codex CDP · CC-3/Cascade · re-loop safety PASS
