# PENDING LIST · register upload + chat sweeps · 2026-09-01

**Canonical register:** `docs/register/IH35-UI-MECHANICAL-FIX-REGISTER-2026-09-01.csv` (73 rows)  
**Score now:** **37 FIXED** · **19 STILL OPEN** · **7 PARTIAL** · **6 NOT VERIFIED** · **3 REPORTED DONE (needs Live FAIL fix)** · **1 DSP-05 backend-only**

Do **not** idle waiting for Cursor. Pull your NOW row. Isolated worktrees only.

---

## A — REGISTER PENDING BY SEAT (what CC-1/2/3 are waiting on)

### CC-3 — build NOW (ParityTable = one PR)
| ID | Status | Item |
|----|--------|------|
| **COL-02** | STILL OPEN | Column drag-reorder |
| **COL-03** | STILL OPEN | Column AUTO-FIT |
| **CTL-01** | REPORTED DONE — Live FAIL | Buttons h-9 (Devin: still h-8) |
| **CTL-02** | REPORTED DONE — Live FAIL | Checkbox ≥24×24 (Devin: 16px) |
| **CTL-03** | REPORTED DONE — Live FAIL | Gear real icon size (Devin: 16px) |
| COL-01 | PARTIAL | Sort on every module (not only ParityTable) |
| FLT-01 | STILL OPEN | Filters = comboboxes, correct proportion |
| CUS-01…07 | STILL OPEN | Customers/vendors dual pages, stubs, balance sort, health 0.0, W-9, em-dashes, reverse sections |

**CC-3 NOW order:** COL-02 → COL-03 → CTL-01/02/03 real fix → FLT-01 → CUS-01…07  
**Worktree:** `/tmp/ih35-cc3-wt` ONLY — never `/private/tmp/ih35-main-sb` while Devin/Cursor share it.

### CC-1 — money / schema / DSP
| ID | Status | Item |
|----|--------|------|
| **DSP-05** | BACKEND SHIPPED · flag OFF · FE modal pending | Assignment confirm API + audit + owner-override (Cursor owns modal after API live) |
| **COL-05** | PARTIAL | Total / Open / Variance on every payable money grid |
| COL-06 | PARTIAL | Settlement # / Period Begin / End on every settlement surface |
| UPL-01 | STILL OPEN | One upload architecture (docs.files vs documents.attachments) |
| DQF-01 | STILL OPEN | DQF catalog/FK half (Cursor = UI; CC-1 = catalog) |
| VIS-04 | blocked on schema | Needs `catalogs.void_reasons` — **CC-1 owns migration** |

**CC-1 NOW order:** DSP-05 finish (flag decision + prove) · COL-05 finish · void_reasons migration for VIS-04 · UPL-01 design · DQF catalog  
**Worktree:** `/tmp/ih35-cc1-wt`

### CC-2 — guards / live verify (open PRs already)
| Item | Action |
|------|--------|
| **#19103** | NO-SEAT + WIR-02 guard — Recipe C push → FAST-MERGE |
| **#19105** | LAW-TRANSACTION-HEALTH bands — gate → merge |
| **#19111** | GUARD-SELFTEST-MUTATES-SOURCE — gate → merge |
| Register | Stamp FIXED only after merge + selftest green |
| Do not | Grow `VERIFY-STATIC-BASELINE.json` in feature PRs |

**CC-2 NOW:** serialize those three PRs (one merge at a time) — do not wait for Cursor text.  
**Worktree:** `/tmp/ih35-cc2-wt`

### CURSOR — remaining OPEN/PARTIAL/NOT VERIFIED
| Priority | IDs |
|----------|-----|
| P0 chrome | FLT-03 finish (Bills/Invoices hide-voided) · VIS-02 finish · SRC-02 dispatch residue |
| P0 modal | MOD-01 Book Load reopen trap · VIS-04 (after CC-1 void_reasons) |
| Layout | LAY-01 law · LAY-06/07/10 verify-or-fix · PLN-03/04 |
| Dispatch | DSP-01 verify · DSP-02 PU/DEL date+time cols · DSP-05 FE modal |
| Other | SEL-04 settlements/loads void · UPL-06 · WIR-04 W-8BEN · DQF-01 UI · UPL-01 FE half |

**Cursor worktree:** `/tmp/ih35-cursor-wt` ONLY.

### CODEX
| ID | Note |
|----|------|
| UPL-06 | Open PR **#19162** — finish FAST-MERGE |
| Next | Remaining WIR/DSP from register OPEN after UPL-06 |

---

## B — CHAT-SWEPT TEST DENSITY BLOCKERS (not register IDs)

These are **constraint PASS / honest stops**, not laziness. Empty catalog / check-constraint = wizard would fail the same way.

| Hop | Blocker | Next action | Seat |
|-----|---------|-------------|------|
| Cargo complaint | needs `complaint_type_id` catalog row | Seed USMCA TEST complaint type → create | CC-1 catalog · Cursor create |
| Company violation | `violation_type` enum ≠ `hours_of_service` | Use legal type code from enum | Cursor/Safety |
| Leave request | needs generated `request_number` | Wire server display-id on create | CC-1 |
| Factor default interest | `before_grace` | Use valid interest timing enum | CC-1 factoring |
| Factor reserve release | `policy_over_release` on FAC-2026-00001 | Do **not** force; pick releasable advance or adjust policy | CC-1 |
| Chargeback | would reverse only live factoring advance | Do **not** run on that advance | CC-1 |
| `banking.equipment_loans` empty | USMCA owns no equipment | Correct — use finance hub loans (already created) | N/A not a defect |

**Owner-ordered TEST corpus `TESTMTDP79YF` — KEEP ON BOOKS (do not void):**  
Truck T-TESTMTDP79YF · trailers TRL-…-1/2 · loan $120k · personal loan + CA-2026-0002 · Amex card · accident · legal dispute/suit · DOT pass + OOS · Active + Terminated drivers · failed drug test.

**Immediate unique hops (when unblocked):** cargo-complaint + type catalog · company violation legal type · leave + display id · roadside AP bill posted · September FREIGHT recon zero-diff.

**Known chat reopen (money):** TEST Amex `TESTMTDP79YF` shared `ledger_account_id` with USMCA FREIGHT → UNIQUE cash GL binding defect → **CC-1** (CON-05 class).

---

## C — WORKTREE LAW (tonight’s corruption root)

| Path | Owner |
|------|-------|
| `/tmp/ih35-cursor-wt` | Cursor |
| `/tmp/ih35-cc1-wt` | CC-1 |
| `/tmp/ih35-cc2-wt` | CC-2 |
| `/tmp/ih35-cc3-wt` | CC-3 |
| `/tmp/ih35-codex-wt` | Codex |
| `/private/tmp/ih35-main-sb` | **POLLUTED** (Devin poll + shared) — create worktrees FROM it; do not build in it |

```bash
git -C /private/tmp/ih35-main-sb fetch origin main
git -C /private/tmp/ih35-main-sb worktree add -B <seat>/<slug> /tmp/ih35-<seat>-wt origin/main
```

---

## D — ONE-LINE GO (paste to seats)

```
CC-1 | ACK | NOW=DSP-05-finish→COL-05→void_reasons | WT=/tmp/ih35-cc1-wt | GO
CC-2 | ACK | NOW=merge-#19103→#19105→#19111 Recipe-C | WT=/tmp/ih35-cc2-wt | GO
CC-3 | ACK | NOW=COL-02→COL-03→CTL-01/02/03-real | WT=/tmp/ih35-cc3-wt | GO
CURSOR | ACK | NOW=FLT-03-Bills→MOD-01→DSP-02 | WT=/tmp/ih35-cursor-wt | GO
CODEX | ACK | NOW=#19162-UPL-06 | GO
```
