# STOP-AND-ALIGN — Cursor (updated after owner lock 2026-07-25 evening)

## Owner locks (binding)
1. **#3551** fine-GL → fold into **SWEEP-C6** (with SAF-B18). Do NOT merge standalone.
2. Ship **SWEEP-C6 guard FIRST**, then **C2**, then **C11**.
3. **#3526** ACCT-R-03 — keep HELD (owner review).
4. Every block uses **BLOCK-TEMPLATE-8-LAYER**. No solo money-poster PRs until C6 guard is on main.

## In-flight triage → GUARD
| Item | Class | Action |
|---|---|---|
| SWEEP-C6 guard PR | C6 STEP 1 | **SHIPPED** #3555 @ 842a93e0 (verify-step 1503) |
| #3551 SAFETY FINE-GL | **C6 instance** | HOLD — absorb in C6 fix wave |
| #3526 ACCT-R-03 CoA merge | module-domain | KEEP HELD |
| #3554 LINK-02 | catalog FK | Neon-applied; owner unlock + checksum; merge after CI green |
| #3556 registry truth-up | hot-file | Claude squash-merge first (held=0) |
| Solo ACCT-R money/GL | → C6 | STOP until C6 fix wave |

## LINK-02 (finish)
| Item | State |
|---|---|
| Code PR | [#3554](https://github.com/tioperfumes07/IH35-TMS/pull/3554) |
| Neon DDL | **Applied** checksum `4d66df41…` @ 2026-07-25T22:15:16Z |
| Owner unlock | `DETAIL_TYPES_FK_OWNER_UNLOCK` in migration + checksum override |

See also: `docs/trackers/SWEEP-C6-GUARD-FIRST-2026-07-25.md`
