# CC-1 — FINAL-3 (10-25-2026 6:00 PM CT) · 4 rows · law: 10-25-2026-ALL-CODERS-FINAL-3-LAW.md

Measured against origin/main 5:40 PM (commit names row / round / D-code). Work top to bottom, fast-merge each.

| Row | Item | Done = |
|---|---|---|
| 269 | ENG-34 — 920 guard-exempt entries CI does not run | each entry wired into a verify-step or deleted; exempt count strictly down; shrink-only ratchet with selftest |
| 285 | ENG-40 — P-0067 and P-0119 closed with no company settlement | both carry their company settlement (engine path, not a JE plug) or are reopened per the close rules; guard: no closed driver settlement without its company settlement (live, USMCA) |
| 288 | ENG-43 — 2 posted with zero load lines; P-0112/0116/0079/0114 $0 header; line ffac5c35 miles/rate NULL; closed-unposted with voided deduction | each fixed at the writer (root cause) + data repaired through the engine; guard per defect class |
| 291 | ENG-46 — bill_payment ad02cc37 no source link; escrow sub-ledger 315,000¢ vs baseline 132,500¢; 5796/P-0102 USMCA settlement for a Transportation document | source link restored; escrow sub-ledger ties to GL document by document; cross-entity document resolved (Transportation is frozen — do not write it; fix the USMCA side) |

Then: "CC1 DONE" + PR list.
