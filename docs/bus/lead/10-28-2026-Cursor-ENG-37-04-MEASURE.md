# ENG-37 + ENG-04 measure — 2026-10-28 CT

## ENG-37 → DONE
- `verify-balances-render-in-natural-sign` PASS
- `verify-no-surface-prints-a-raw-ledger-sign` PASS
- 54 balances; 25 income/liability/equity flipped to natural positive
- **3 genuine abnormalities** (still render negative — not UI bugs):
  - 1000 Bank of America Operating **−77,987.89**
  - 3000 Owner's Capital / Contributions **−21,450.00**
  - 8000 Inter-company Transportation **−12,596.50**

## ENG-04 → PARTIAL (writer done; apply blocked)
Dry-run reconfirmed (no write):
| action | count | ids / note |
|---|---:|---|
| PROPOSE_RECLASS | 3 | CA-2026-0004, 0006, 0007 · **$705.97** · BANK_UNIQUE → Dr 2170 / Cr 1000 |
| NO-EVIDENCE | 3 | CA-2026-0001, 0003, 0009 |
| BANK_AMBIGUOUS | 6 | CA-2026-0002, 0005, 0008, 0010, 0011, 0012 |
| Residual 2170 credit | | **$2,575.96** (257,596¢) |

No apply script / OWNER AUTH on file — Lead will not invent the 3 reclass JEs. Writer path already refuses new 2170 credits (#27902).
