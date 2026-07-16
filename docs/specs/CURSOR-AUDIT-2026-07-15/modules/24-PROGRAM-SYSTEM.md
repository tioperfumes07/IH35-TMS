# 24 — PROGRAM + SYSTEM

**Verdict:** PROGRAM is an Owner/Admin build-progress tracker (clean default + archived legacy board). SYSTEM is Owner-only ops cockpit for QBO recon/sync, program mirror, build health, and Claude Coder launcher (no command execution). Neither posts money; both are trust/ops surfaces.

## Live evidence notes
**REPO-ONLY.**
- Sidebar PROGRAM → `/program` Owner/Admin/SuperAdmin (L141); SYSTEM → `/system` Owner (L144)
- Program routes: `/program`, `/program/tracker` (alias), `/program/legacy-board` (archived board), `/program/final-additions` (manifest L703–737)
- Default page: `ProgramTrackerPage.tsx`
- System: `SystemModulePage.tsx` — `SYSTEM_TABS` Overview / QuickBooks Reconciliation / QuickBooks Sync / Program Tracker / Software·Build / Claude Coder
- Guard reference: `scripts/verify-system-module.mjs` (cited in SystemModulePage)

## Surface / button inventory

### Program

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar PROGRAM | Nav | `/program` → ProgramTrackerPage | HAVE |
| Tracker | Stat cards / phase pills / block tables | Live `getProgramTracker` | HAVE |
| Tracker | Layer chips FE/BE/DB/GL/RLS/G/T | Completeness columns in extended view | HAVE |
| Tracker | PR links | External PR URLs when present | HAVE |
| Legacy | `/program/legacy-board` | Old Audit-Truth board ARCHIVE-not-DELETE | HAVE (reachable) |
| Final additions | `/program/final-additions` | FinalAdditionsPage | HAVE |
| Create/edit blocks UI | Operator mutate tracker | Not primary CTA on tracker | MISSING (likely API/registry driven — OK if honest) |

### System

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar SYSTEM | Nav | `/system` OwnerOnlyRoute | HAVE |
| Tabs (6) | Overview / QBO Recon / QBO Sync / Program Tracker / Software·Build / Claude Coder | SecondaryNavTabs | HAVE |
| Overview | GhostButtons open each tab | | HAVE |
| QBO Recon tab | Live `getQboReconciliation` + AP aging reads | Tie-out — NOT bank reconcile | HAVE (read) |
| QBO Sync tab | `getQboSyncHealth` | | HAVE (read) |
| Program tab | Snapshot + **Open full Program Tracker** → `/program` | | HAVE |
| Software / Build | Health endpoint reads | | HAVE |
| Claude Coder | **Copy launch command** | Copies `claude --project IH35-TMS` — no exec | HAVE (safe) |
| Cross-links | Banking reconcile | Must not be confused with QBO Recon tab | DRIFT risk (naming) |

## Connectivity to money/ops
- QBO Reconciliation / Sync are correctness tests under parallel-books law (ARCHITECTURE-BLUEPRINT §7) — not write-back.
- AP aging figures displayed are read-only.
- Program tracker layers include GL/RLS — meta about money wiring, not posting.

## HAVE / MISSING / DRIFT / WILL FAIL
**HAVE:** Program tracker default; legacy board preserved; System 6-tab Owner cockpit; copy-only Claude launcher; links into Program.
**MISSING:** Non-Owner visibility into System (by design); in-app “run sync” destructive actions (may be correct).
**DRIFT:** “QuickBooks Reconciliation” naming vs Banking Reconcile — high confusion risk for staff.
**WILL FAIL:** If health/recon APIs 500, Overview shows “—” — operators may think books unbalanced without drill proof.

## Professional recommendation
Keep PROGRAM and SYSTEM (never delete). Rename System tab copy to “TMS↔QBO Tie-out” (keep route) to distinguish from Banking reconcile — additive label change + arch/doc update. Ensure every “—” value has a drill button to the owning screen. Do not add command execution to Claude Coder. Program legacy board stays archived-reachable only.

## Deep button inventory (repo) — finish pass 2026-07-15

**Evidence root:** `apps/frontend/src/pages/program/` · `apps/frontend/src/pages/system/SystemModulePage.tsx` · sidebar `sidebar-config.ts:141,144`

### Program
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Sidebar PROGRAM | `sidebar-config.ts:141` | `/program` Owner/Admin/SuperAdmin | HAVE |
| Tracker body | `ProgramTrackerPage.tsx:349-367` | Live `getProgramTracker` | HAVE |
| Legacy audit board link | `ProgramTrackerPage.tsx:356-358` | `/program/legacy-board` ARCHIVE-not-DELETE | HAVE |
| Phase / module tables | `ProgramTrackerPage.tsx` SequenceTable / module expand `:212` | Read-only progress | HAVE |
| Operator mutate/create blocks CTA | Not primary on tracker | Registry/API driven | MISSING (OK if honest) |
| Final additions | `/program/final-additions` | FinalAdditionsPage | HAVE |

### System (6 tabs — client state)
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Sidebar SYSTEM | `sidebar-config.ts:144` | `/system` Owner | HAVE |
| SYSTEM_TABS | `SystemModulePage.tsx:23-30` | Overview / QBO Recon / QBO Sync / Program / Software·Build / Claude Coder | HAVE |
| Tab state | `SystemModulePage.tsx:612,619` | `useState` — **no URL per tab** | WILL FAIL bookmark |
| Overview GhostButtons | `SystemModulePage.tsx:207+` | `onOpen` switches tab | HAVE |
| QBO Recon | `SystemModulePage.tsx:296-347` | `getQboReconciliation` — NOT bank reconcile | HAVE (read) / DRIFT naming |
| QBO Sync | `SystemModulePage.tsx:354+` | `getQboSyncHealth` | HAVE (read) |
| Open full Program Tracker | `SystemModulePage.tsx:402-404` | `Link to="/program"` | HAVE |
| Claude **Copy launch command** | `SystemModulePage.tsx:35,512-534` | Copies `claude --project IH35-TMS` — **no exec** | HAVE (safe) |
| “—” placeholders | Multiple Row renders | API pending / error | WILL FAIL trust if no drill |

### Top WILL FAIL (new evidence)
1. **“QuickBooks Reconciliation” confused with Banking Reconcile** — naming `SystemModulePage.tsx:25,303-305`.
2. **Cannot bookmark System tab** — `useState` only `:612`.
3. **Health “—” without drill** reads as books unbalanced.

**Never delete** PROGRAM, legacy board, or SYSTEM — rename labels / add drills only. No command execution on Claude Coder.
