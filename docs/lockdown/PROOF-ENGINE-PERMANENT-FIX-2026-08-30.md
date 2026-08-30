# THE PERMANENT FIX — PROOF ENGINE
Built and tested 2026-08-30. Selftest 7/7. Replayed live against `48e08e5`.
Files: `proof-engine.mjs` · `selftest.mjs` · `demo-live.mjs`

---

## THE DISEASE — one sentence

**`status`, `prod_verified` and `complete` are hand-written flags, and `evidence` is prose.
Nothing can falsify any of them.**

Every failure in this project traces to that sentence:

| What happened | The same root cause |
|---|---|
| `DRV-S04` sits at `PASS` while its own evidence says NOT YET VERIFIED | a human typed `PASS` |
| `ACCT-R-04` — identical shape | a human typed `PASS` |
| six modules `complete: true` at 2/38, 0/10 | a human typed `true` |
| `RPT-VERIFY-01` closed because its siblings were green | prose accepted as proof |
| the static baseline frozen at 209 for 2h20m | a stored number nothing recomputed |
| `dot_oos` reporting 14 DOT out-of-service trucks | a number nothing cross-checked |
| the matrix serving zeros while logs said success | a claim nothing replayed |
| **my own five detectors, all wrong** | prose cannot be classified by regex |

Guards, ratchets and rules have all been added on top of this. **None of them fix it**, because
they all still ultimately read a flag somebody typed.

---

## THE CURE — make the verdict an OUTPUT, not an INPUT

`status` and `prod_verified` **stop being writable.** They are computed by replaying typed,
executable proofs against the **current live SHA**.

```js
// REJECTED at load — this is what a bad record looks like today
{ id:"DRV-S04", status:"PASS", prod_verified:false, evidence:"NOT YET VERIFIED..." }
   -> Error: HAND-WRITTEN VERDICT REJECTED on DRV-S04: status, prod_verified.
      These are OUTPUTS of replay, not inputs. Supply proofs[] instead.

// ACCEPTED — no verdict fields at all, only replayable assertions
{ id:"SYS-HEALTHZ-01", proven_at_sha:"48e08e5",
  proofs:[ {kind:"http", path:"/api/v1/healthz/shallow",
            expect:{status:200, json_path:"$.ok", op:"==", value:true}} ] }
   -> DERIVED: { status:"PASS", prod_verified:true, why:"2/2 proofs replayed at 48e08e5" }
```

### Five proof kinds. Every one can fail.
| kind | proves |
|---|---|
| `http` | a live route answers, and its payload satisfies an assertion |
| `sql` | a scoped read returns what was claimed |
| `dom` | the element actually renders in the live page |
| `guard` | a guard script exits 0 |
| **`mutation`** | **defeat the check, re-run, demand non-zero** — the only kind that proves a *check* is real |

### The four derivation rules
```
no proofs            -> UNVERIFIED   (prose can never produce PASS)
any proof failed     -> FAIL         (visible, not hidden behind a stale PASS)
proven at old SHA    -> STALE        (self-invalidating; nobody has to remember)
all green at live SHA-> PASS + prod_verified:true
```

---

## WHY THIS IS PERMANENT AND THE OTHER FIXES WERE NOT

Everything tried so far **detects** bad records. This makes them **unrepresentable.**

- `DRV-S04` cannot exist. Prose evidence yields zero proofs; zero proofs yields `UNVERIFIED`.
  There is no code path from prose to PASS.
- `RPT-VERIFY-01`'s closure cannot happen. "My siblings are PASS" is not a proof kind.
- A stale stamp cannot survive a deploy. The SHA comparison runs every time.
- **No regex ever reads evidence again** — which matters, because I wrote five regex detectors
  tonight and every one produced a confident wrong number.

## SELFTEST — 7/7, each arm plants a real defect from this session
```
PASS  DRV-S04 shape (prose only, no proofs) CANNOT be PASS
PASS  a hand-written status:PASS is REJECTED at load
PASS  one failing proof => FAIL, never a silent PASS
PASS  passed at an OLD sha => STALE, never PASS
PASS  all proofs green at the LIVE sha => PASS
PASS  mutation proof: a guard that SURVIVES being defeated => FAIL
PASS  RPT-VERIFY-01 shape: sibling PASS is not a proof kind
```

## LIVE — not a toy
```
live sha: 48e08e5
  proof[0] http: ok=true observed=true      317ms
  proof[1] http: ok=true observed=48e08e5    89ms
DERIVED: PASS · prod_verified true · "2/2 proofs replayed at 48e08e5"
SAME PROOFS, OLDER SHA -> STALE | proven at deadbee, live is 48e08e5
```

---

**Repo paths (2026-08-30 Cursor):** `scripts/proof-engine/proof-engine.mjs` · `selftest.mjs` · `demo-live.mjs` · `shadow-report.mjs`.
**Law this session:** shadow only. `assertNoHandWrittenVerdict` is not wired into `verify-module-completion`. Flip module by module after that module's disagreement list is empty.

## ADOPTION — additive, nothing is rewritten at once

1. **Add `proofs[]` beside the existing fields.** Change nothing else. Both systems run.
2. **Run in shadow mode.** Compare derived verdict against the hand-written one and report only
   disagreements. **Every disagreement is a real finding** — that list is the honest backlog.
3. **Flip module by module.** Once a module's items all carry proofs, delete its `status` and
   `prod_verified` fields and let `assertNoHandWrittenVerdict` enforce it.
4. **Then `complete` becomes derived too** — all items PASS at live SHA, or it is not complete.
   The flag disappears; there is nothing left to go stale.

**Start with the 26 remaining items.** They need verification anyway — write it as proofs
instead of prose and they are the first module-set that can never drift.

## OWNERSHIP
Core engine + `assertNoHandWrittenVerdict`: **Cursor** (EVEN) — it is CERT-01's foundation, and
FW 1/2/4/5/10/11 become proof kinds rather than bespoke code.
`sql` and `dom` runners: **CC-1** (≡1) and **Cursor** respectively.
Shadow-mode report: **CC-2** (≡3) — it owns the stamping lane and the disagreement list is its
work queue.

## WHAT THIS DOES NOT DO — stated plainly
It cannot judge whether a balanced journal entry hit the **right** account, and it cannot judge
taste. FW 3 and FW 8 stay human. Anyone who later claims this automates all twelve is
reintroducing the exact defect it exists to remove.
