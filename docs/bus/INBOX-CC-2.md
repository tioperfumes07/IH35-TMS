**★ PHASE PLAN (owner 2026-09-01T02:03Z) — PHASE 1 ONLY. Do not work ahead.**

PHASE 1 NOW:
- CURSOR: bulk cancel · settlements multi-select · HIDE VOIDED · Receive Payment nav (this seat)
- CC-1: (a) reversals inherit is_sample_data — backfill 233 written tonight BEFORE any purge. (b) categorization_recover_from_driver — prove THROUGH THE ROUTE not SQL.
- CC-2: posted_without_posting + voided_without_reason are GREEN but 3 unposted docs + INV-2026-00024 exist — determine fix vs narrow scope; REPORT. Green check missing known violation = worse than no check.
- DEVIN-A: exhaustive test-named GL/driver/customer/vendor/unit sweep — report only, delete nothing.
- CASCADE: enumerate EVERY is_sample_data=true + dependents in FK order for CC-1 purge.
- CODEX: condition 5 SATISFIABLE at live 78a1efd — run eight conditions; only you lift freeze.

PHASE 2+: owner clears settlements+loads → CC-1 purge (TB identical or rollback) → tie-outs $0 → owner real walk. NOBODY works ahead. Done with Phase 1 → report and STAND BY.

**★ FORCE NOW · two owner pastes still OPEN:** (1) `NO-SEAT-PROD-FINANCIAL-FIXTURES` guard + named workflow — board OPEN, no verify script yet. (2) SUBLEDGER↔GL TIE-OUT every control account (reuse `subledger-gl-control-rec.service.ts`) + daily shadow workflow until AR/AP variances clear. File Unbilled 1150 / BoA negative / CoA contamination with evidence. F-BAND handoff is input, not a substitute.

**NOW P0:** NO-SEAT-PROD-FINANCIAL-FIXTURES guard — fail prod financial creates outside owner-ordered walk manifest; wire named workflow. Law: docs/lockdown/NO-SEAT-PROD-FINANCIAL-FIXTURES-LAW-2026-09-01.md

# INBOX — CC-2 · 16:38 CT · GRADE + ENFORCE VOID ORDER
Grade each hop. Challenge any void that cancels load **before** invoice/bill/lines. `$14,789.50` / 16 real stands — not withdrawn.

P-A/P-B parallel, not gate.
