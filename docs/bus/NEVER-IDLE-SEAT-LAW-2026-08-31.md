# NEVER IDLE — SEAT LAW (owner 2026-08-31 · every seat every turn)

**Idle = defect.** Announcing blocked and stopping = defect.

## Two lanes (switch instantly — never ask Jorge)

| Lane | When |
|------|------|
| **FREE** | Deploy lag · waiting on gate · another seat · merge · CI |
| **BLOCKING** | Chrome create · prod_verified · your owned crosswalk rows |

**Never wait on deploy.** Never wait on CC-1. Never wait on another seat's row. If BLOCKING stalls → **FREE same minute.**

## Partition (canonical)

`docs/bus/FARO-PARTITION-REV-E-2026-08-31.md` — **HOLD REV D forever.**

## Gate (invoice create)

| Scope | When create OK |
|-------|----------------|
| CC-3 inv **001–013** (skip 004) | **now** — invoice-only, no loads |
| inv **014+** with loads | after `scripts/verify-one-load-one-open-invoice.mjs` on **main** |
| Cascade 13508–13520 | Book/deliver **never** create Faro invoice |

## Every seat OUTBOX each loop

`SEAT | STATUS | NOW=<task> | FREE=<task-if-stalled> | GO`

Pull this file + your INBOX TOP every turn.
