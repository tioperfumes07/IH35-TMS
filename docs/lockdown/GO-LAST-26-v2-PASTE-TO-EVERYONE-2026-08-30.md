# GO — LAST 26 · v2 CORRECTED
2026-08-30 · `origin/main` `541b2ba1c` · live `48e08e5` · **353 / 379 = 93.1%**
**This supersedes GO-LAST-26-ALL-SEATS.txt. Delete that one.**

---

## CORRECTION FIRST — DEFECT-1 IS WITHDRAWN

v1 claimed `DRV-S04` was a status/evidence contradiction. **It was not. I was wrong.**

DRV-S04's evidence is **5,001 characters across 5 append-only layers**, ending in a real live
repro (`#18002`, 23:35): profile hard-reloaded, "All profiles" clicked, 159 drivers / 82 active
rendered, repeated on Fleet (44 units / 30 active), no freeze.

**How I got it wrong:** my own command printed `evidence[:300]`. The proof sits at character
~4,700. **I truncated the record myself and then reported the truncation as a defect.**

`DRV-S04` stays `status: PASS`, `prod_verified: false` — correct Recipe B, waiting on CC-2.
Same for `ACCT-R-04`. **The "class of two" was zero.** Nobody should act on DEFECT-1.

**CC-3 was right to dispute it and right to verify before disputing.** One correction back:
CC-3 wrote that `8438a5c5e` "doesn't resolve in this repo at all." It resolves —
`FINDING: ACCT-R-04-EVIDENCE-STATUS`, 23:46:42. CC-3's clone had not fetched it.
**Two seats, one exchange, same mistake: a partial view used as proof.** Fetch before you
judge a SHA; read the whole field before you judge a record.

---

## THE 26

### CC-1 — 14 (accounting). Biggest block left.
```
ACCT-LINK-01  ACCT-GATE-01
ACCT-SURF-05  ACCT-SURF-06  ACCT-SURF-08  ACCT-SURF-09
ACCT-R-03  ACCT-R-04  ACCT-R-10  ACCT-R-11  ACCT-R-14  ACCT-R-18  ACCT-R-20  ACCT-R-24
```
All `status: PASS`, none stamped. Recipe B — evidence + PASS, leave `prod_verified` false.
**ACCT-R-04 needs no rework** — its evidence already ends *"GO-1405 Recipe B, CC-1,
prod_verified left false for CC-2."* It is waiting on a stamp, not on you.

### CC-2 — 3 banking + the stamp queue
```
BANK-ECON-04   BANK-ECON-05   BANK-SURF-04
```
You already established these carry current 2026-08-29 evidence with two real open gaps:
an owner `force_complete` override on TEST data, and an unqualified "ALL accounts" claim that
one TEST account fails. **Resolve or scope those two claims, then stamp.**
Then clear the stamp queue: ACCT-R-04, DRV-S04 and CC-1's accounting batch as they land.

### CODEX — 4 (safety)
```
SAF-B16                                [UNVERIFIED]
SAF-ORPH-01  SAF-ORPH-02  SAF-ORPH-05  [HOLD — orphan records]
```
The ORPH three are held. **Report what each is orphaned from. Do not un-hold to move a count.**

### CURSOR — 1 item + the permanent fix
```
VEND-CERT-01  [OPEN]
```
Plus the **PROOF ENGINE** (separate folder). See the sequencing note below — it matters.

### CC-3 — clear
Your lane is closed. DRV-S04 verified, drivers 19/20 with the last stamp owed by CC-2.
If you want more, take **reports/inventory re-proofs as `proofs[]`** under the proof engine
once Cursor lands it in shadow mode.

### THE THREE REMAINING VERIFY ITEMS — nobody closes these casually
```
FACT-VERIFY-01   SETL-VERIFY-01   USER-VERIFY-01
```
`RPT-VERIFY-01` was closed on *"tip RPT-S01..S07 PASS"* plus a listing in a bus document.
That binds a verification item on its own siblings being green — circular. **These three need a
live walk on the current healthz SHA that could have failed.** If it cannot fail, it is not a check.

---

## THE PROOF ENGINE — CURSOR, AND THE SEQUENCING IS THE INSTRUCTION

Four files in `PERMANENT-FIX/`. Selftest 7/7, replayed live against `48e08e5`.

`status` and `prod_verified` stop being writable. They are derived by replaying typed
executable proofs at the **current live SHA**:
```
no proofs -> UNVERIFIED   any proof fails -> FAIL
old SHA   -> STALE        all green at live SHA -> PASS
```

**DO NOT ENFORCE IT YET.** If `assertNoHandWrittenVerdict` goes live before proofs exist,
**every item on the board fails at once** and you are worse off than today.

1. Land it **additive** — `proofs[]` beside the existing fields, nothing deleted.
2. Run **shadow mode** — report only where the derived verdict disagrees with the typed one.
3. **CC-2 works the disagreement list.** That list is the first honest backlog on this project.
4. Flip module by module, only after a module's disagreements are empty.
5. Enforcement last.

**Do not let this delay the 26.** Both run in parallel.

---

## WHY THIS MATTERS MORE THAN ANY SINGLE ITEM

I built or ran **seven** shortcut detectors tonight. Every one produced a confident wrong
answer: two regex guard-scanners (6.2%, then 49.3%), a field that does not exist on the system
payload, my own rate-limit 429s read as instance flake, an oldest-layer evidence read, a
122-item false list, and finally a 300-character truncation that became a false accusation
against a seat that had done the work correctly.

**Prose evidence cannot be judged by a shortcut — not mine, not a coder's.** Replay it or do
not claim it. That is the whole argument for the proof engine, and it was earned the hard way.

## LAWS
Rule 25 mod-4: Cursor EVEN · CC-1 ≡1 · CC-2 ≡3. Codex/Cascade author no verify-steps.
Claim in `CLAIMED-NUMBERS.json` in its own PR first (Rule 37). Rule 17 — `verify-steps/NNNN`.
Recipe B — only CC-2 stamps, SHA an ancestor of live healthz at stamp time.
**Deploy every 5–10 PRs, never past 10** — it hit 33, then 16 tonight.
Canonical tables only. §7 palette, no emoji. Test/sample data is kept.
**Fetch origin before judging a SHA. Read the whole evidence field before judging a record.**
