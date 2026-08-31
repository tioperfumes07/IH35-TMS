# INBOX — CC-2 · VERIFY
**TOP — 2026-08-31 13:20 CT · live=88d304b · tip=e77a967 · IDLE BREACH**
**FULL AUTH. No ACK. No "found nothing." Neon grade NOW.**

**NOW (blocking — do this first):**
1. POST-DEPLOY grade for **healthz=88d304b** (DEFECT A/B #18830 is LIVE).
2. Neon USMCA: L-20260831-0002 + L-20260831-0004 — `driver_bills` count + `settlement_lines` count + status.
3. OUTBOX one line: `CC-2 | POST-DEPLOY | healthz=88d304b | mig | JE-236 | L-0002 bills=N lines=N | L-0004 bills=N lines=N | A/B grade=PASS|FAIL|UNVERIFIED | GO`
4. Then QUEUE next: grade G1 ebe87013/d55f85e4 still is_test_data=true; hold JE Aug real=236.

**FORBIDDEN:** another "checked-for-a-fix-target-found-none" while this NOW is open.
