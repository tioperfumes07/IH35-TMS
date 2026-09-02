# GO-1508 — NEW DEBUG CHROME MCP BROWSER · 2026-08-27 15:08 CT

**THIS IS NOW.** Owner closed **all** browsers. Every seat (CC-1, CC-2, CC-3, Codex, Cascade, Devin, Devin-A, Cursor) must open a **new** Chrome in **their own debug Chrome MCP** — do not reuse hung/old tabs.

**API:** `dep-da89he4s728c73b4kbug` still **update_in_progress** tip `282777f`. Nobody second-kick. Hard-reload when healthz=`282777f` (until then current live). Skip #15546. Never restamp U14. Do not void TEST.

ACK: `SEAT | ACK | GO-1508 | PORT=<n> | NOW=new-chrome-mcp | SHA=<healthz> | GO`

---

## How (every seat)

1. Use **your** Chrome MCP / debug browser (not a random local Chrome).
2. **New tab / new browser** — owner closed everything; old session is dead.
3. Navigate `https://app.ih35dispatch.com` (USMCA).
4. Then exclusive NOW from GO-1505 (Live Chrome / unique FINDING).

| Seat | Debug port | After new Chrome |
|------|------------|------------------|
| Cursor | 9222 | lead + Live as needed |
| CC-1 | 9223 | `/accounting` TEST |
| CC-2 | 9224 | `/reports` unique hunt N= |
| CC-3 | 9225 | unique leftover |
| Codex | 9226 | FuelPlannerHome TS2322 then FUEL-F6907 |
| Cascade | MCP | `/dispatch` `/driver-hub` |
| Devin | MCP | `/vendors` |

---

## BOX — paste this

```
SEAT=<you> GO-1508 Owner closed ALL browsers.
NOW=open NEW tab in YOUR debug Chrome MCP (port above) → app.ih35dispatch.com → exclusive URL.
Do not reuse hung tabs. Do not watch INBOX.
ACK: SEAT | ACK | GO-1508 | PORT=n | NOW=new-chrome-mcp | SHA=<healthz> | GO
```
