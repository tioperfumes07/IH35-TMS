# GO-0030 RIDER — collision fail-closed · CLOSES · GUARD · never-wait (2026-08-29)

**Send with GO-0030.** Do not stall seats over this rider — chrome + TEST still run. Standing orders remain underneath: `docs/lockdown/STANDING-ORDERS-CC-1-CC-2-CC-3-2026-08-29.md`.

ACK: `SEAT | ACK | GO-0030+RIDER | NOW=<one line> | SHA=<healthz> | GO`

---

## Gap 1 — collision (money-risk) — CLOSED on main by Cursor PR with this rider

Five seat prefixes (`cc-3/`, `codex/`, `cascade/`, `devin/`, `devin-a/`) used to **SKIP** lane-band guards (green CI, silent collision risk).

**Law now:**

| Prefix | Verify-steps | Migrations |
|---|---|---|
| `claude/`, `cc-1/`, `cc1/` | ≡1 (mod 4) | HH 00–11 |
| `cc-2/`, `cc2/` | ≡3 (mod 4) | **none** (GUARD — fail if you add one) |
| `cursor/`, `cursoragent/`, chore/feat/fix (Cursor) | EVEN | HH 12–23 |
| `cc-3/`, `cc3/`, `codex/`, `cascade/`, `devin/`, `devin-a/`, `devina/` | **chrome-only — FAIL if any new step** | **FAIL if any new migration** |
| any other unmapped prefix | **FAIL if new step** | **FAIL if new migration** |

Chrome + labeled TEST creates need neither. **Nothing stalls.**

---

## Gap 2 — connect GOs to the launch number — CLOSES line (mandatory)

Every GO packet (and every seat OUTBOX close line) must carry **exactly one**:

```
CLOSES: <ITEM-ID>[, <ITEM-ID>…]
```

or

```
CLOSES: none — <why this GO cannot move prod_verified / N-of-M>
```

**GO-0030 defaults (edit only when you actually close a manifest id):**

| Seat | CLOSES |
|---|---|
| CC-1 | `CLOSES: none — TEST expense hop; stamp ACCT-SURF-02 only after GUARD live prove` |
| CC-2 | `CLOSES: none — GUARD lane: live-prove oldest unproven PASS in reports/cash-flow; flip prod_verified only after live` |
| CC-3 | `CLOSES: none — Lists chrome+TEST; lists manifest items need GUARD after PASS` |
| Codex | `CLOSES: none — Book TEST load; dispatch items need GUARD after PASS` |
| Devin | `CLOSES: none — TEST vendor create; vendors items need GUARD after PASS` |
| Devin-A | `CLOSES: none — TEST customer create` |
| Cascade | `CLOSES: none — unique FINDING only; no prod_verified flip` |
| Cursor | `CLOSES: none — lead/deploy/janitor` |

**Only CC-2 (GUARD)** may set `prod_verified: true` (`docs/module-completion/SCHEMA.md`). That is why 93 items freeze without a GUARD seat — **CC-2 is GUARD. Run it.**

---

## Gap 3 — GO-0054 never returns “wait”

Replace open-ended leftover hunt with this **ordered five-item list** (then loop §8 of standing orders):

1. Unresolved unique FINDING (500 / dead / silent) in **your** lane URLs.
2. Top OPEN row in `docs/audit/GUARD-WORKORDERS.md` in your lane.
3. `bash scripts/next-work-item.sh <your modules>` — take TOP open item.
4. CC-2 only: re-verify oldest `prod_verified:true` against **current** healthz; REOPEN if rotten. Other seats: one labeled TEST hop still missing on your URL.
5. Announce next module with most open items no seat holds → work it.

**Forbidden:** “waiting for the next GO package.”

---

## Lanes (locked — Claude draft was wrong)

- **CC-1** = money / GL  
- **CC-2** = GUARD + leftover reports/cash-flow/finance/tasks  
- **CC-3** = FE / chrome / TEST  

Standing orders: paste entire `STANDING-ORDERS-CC-1-CC-2-CC-3-2026-08-29.md` after one seat line.

---

## Deploy

Cursor kicked prod deploy (Rule 42 — live was hundreds of commits behind). One in-flight. Seats: work on GO-0030 chrome+TEST; do not `trigger_deploy`.
