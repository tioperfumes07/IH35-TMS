# LEAD RULING — THE PARITY RED IS **CASE A**. ONE DEFECT IS GATE-BLOCKING THE ENTIRE REPO.
Claude Lead, 2026-09-23 10:34 PM CT (2026-09-24 03:34Z). Measured live by the Lead, production
`br-fancy-credit-akjnd07a`, USMCA only, `bypass_rls` as a materialized CTE, READ-ONLY.

## MEASURED
```
driver_finance.driver_settlements                     0
driver_finance.historical_settlement_attributions     0
driver_finance.historical_settlement_attribution_items 0
mdata.loads (non-voided, non-sample)                 32
```

## THE RULING — CC-3 DOES NOT RESCOPE THE GUARD
`verify-alwaystrack-parity` is **already correctly feed-scoped**: it arms on a document only once that
document's loads exist. Documents **5777** and **5783** are simply the first two whose loads are fully fed,
so they are the first two that can be checked — and they fail because **the settlement chain never runs**.
That is why the failure GREW as the feed advanced. It is not a scope defect. **It is CASE A: a real defect,
correctly caught.**

**CC-3: do not rescope it, do not baseline it, do not exempt it, do not weaken it.** The guard is right.
Your 142.2/146.3 instruction to consider CASE B is CLOSED by this measurement. You did the right thing
holding rather than forcing a red gate through.

## THE CONSEQUENCE NOBODY NAMED
The gate is repo-wide. So this ONE defect is red for **every branch in the repo**, which is why several
seats look stalled and why CODEX cannot get the 141.3 reason-code backend it needs — that contract is
inside a CC-3 branch that cannot merge through a red gate.

**The single thing unblocking the entire repo is CC-1 ROUND 147.1 item A: settlements exist.**
Chain: `settlements exist -> tours close -> parity goes green -> every held branch merges -> expenses and
driver bills post -> the P&L gets a cost side.` Everything else is downstream of that one item.

## OWNER RULING, NEW, BINDING
> "the settlement should be automatically closed when load is closed."

The settlement is **not** a separate manual step and is **not** hand-created. Closing the load closes its
settlement, automatically, through the existing engine. CC-1 wires that; it does not seed settlement rows by
hand. Reuse `closeSettlementPayRun` and the `settlement-posting/*` services. **NO NEW GL MATH.** Escrow is a
LIABILITY, Driver Cash Advance is an ASSET, maker != checker, void never delete. If the close path cannot
run without an event that does not exist, STOP AND REPORT — do not invent one.

## WHAT A FED LOAD MUST CARRY — OWNER'S DEFINITION, VERBATIM INTENT
Feeding a load is not feeding a load. It is the load **and everything attached to it**:
the load itself · every related expense · every related bill · the driver bill · cash advances recorded as
**bill payments** · every charge to the customer · and the settlement that closes with the load.
Each one written with full linkage at creation (load, driver, unit, trailer, customer, vendor) and each one
posting per `00-LAW-4-WHEN-A-DOCUMENT-POSTS.md`. A load fed without its money is not fed.
The reconciliations exist precisely to prove this. The Lead verifies it every cycle by composition —
documents **with a ledger** versus documents that exist — never by counts alone.
