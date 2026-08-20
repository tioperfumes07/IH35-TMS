# CC-1 · NEVER IDLE · BOARD EMPTY IS NOT DONE

`GUARD-WORKORDERS.md` OPEN = 0 does **not** mean stop. Standing law: empty board → mine backlog. Deadline 06:00 CT.

**Entity:** USMCA only. **Not** QBO sync. **Not** `CLS-BANK-MATCH-DENSITY` 11k HOLD. **Not** TRK/TRANSP.

## Hours queue (do in order, one PR at a time)

1. **Accounting TMS money (Fully-Wired item 3 + money cols):** bills · expenses · invoices · payments · vendor credits — create/save to canonical tables; honest flag-OFF posting; no `|.*` Built theater.
2. **Banking TMS money:** match/categorize/rules UI + write path for **new** TMS-native rows only. Do not backfill QBO-import density.
3. **Factoring TMS money:** advance / reserve / recourse surfaces that already exist — FKs + reverse, no new GL math.
4. **Settlements TMS money:** pay-run close / advances / liabilities — actor stamps, display ids, reverse to driver/load where going-forward.
5. **Kill money theater** still on matrix: `ap_bill` / money-col `leafRe:".*"` / `|.*` floors (`HONEST-BUILT-LAUNCH-LAW`).
6. **AUDIT-COVERAGE-LIVE.md** FAIL+OPEN rows in accounting/banking/settlements/factoring — Status column only when you ship.

If a card is STALE/FIXED on main, skip it and take the next item. ACK each FO in `OUTBOX-CC-1.md`. Never write STANDBY.
