# INBOX-CURSOR · 2026-08-16 21:25 CT

CLAIM FE/API CONNECTIVITY HANDOFF: `LV-PROGRAM-SCENARIO-TRACKER-FETCH-FAILED` — selected-USMCA `/program` renders `STALE — scenario-tracker unreachable (fetch failed)` and all lifecycle `Now:` values as `—`. Locked request `/api/v1/home/scenario-tracker`; frontend error contract and backend mount are cited in board row + audit row 981. Fix the rejected Live request at root, preserve honest stale behavior, add a planted-failure guard, then Live-prove current generated-at/stages. `BLOCKS=LIVE-PROGRAM-Z8`; OWNER-GATED=no.

**FO NOW:** `LV-INSURANCE-POLICY-MODAL-UNREACHABLE-THEATER` (ledger #964 Codex) — PolicyCreateModal never opens; wire or retire dual path honestly.

**Live next:** K5 fuel Leaves after FO or in parallel.

**Lead:** CC-1 A1 accounting — banking-deep forbidden.

---

# INBOX-CURSOR · SYNC 2026-08-16 20:55 CT · NO-STALL FULL QUEUE

**READ:** `docs/bus/CONTINUOUS-LIVE-NO-STALL.md` §5 (lead + K1–K10)

## FORBIDDEN
Leaving any seat on `awaiting next FO` · ending a tick without FO or Live claim · OUTBOX wipe.

## EVERY TICK / EVERY MERGE
1. healthz + main sha  
2. If CC-1/Codex OUTBOX idle/awaiting → rewrite their INBOX tip to next Wave from CONTINUOUS-LIVE-NO-STALL **same turn**  
3. FO every HANDOFF=Cursor  
4. STATUS-NOW honest  

## YOUR LIVE CHAIN (parallel with lead)
`K1 lists` → `K2 safety` → `K3 dispatch` → `K4 fleet` → `K5 fuel` → `K6 maintenance` → `K7 customers` → `K8 vendors` · `K9 drivers` · `K10 docs/tasks/compliance`  
Chunk ≤12 leaves/PR · PROD-VERIFIED + Leaves · FAST-MERGE · next Wave same turn.

Money modules = CC-1. Cascade = OFF Live.

CLAIM FE/API CONNECTIVITY HANDOFF: `LV-USERS-DETAIL-DEFAULT-COMPANY-LABEL-MISSING` — selected-USMCA `/users/86e1e31f-c7b6-4427-bca6-40c5c4cff6d8` renders `Default company: Company — not visible`. Detail API visibility accepts target default-company OR explicit grant, but `accessible_companies` for non-Owner targets returns only explicit grants; UI resolves the default label solely from that array. Board + audit row 956 contain exact source and acceptance. Preserve actor scope; no UUID fallback. OWNER-GATED=no.

CLAIM FE SURFACE-HONESTY HANDOFF: `LV-INSURANCE-POLICY-MODAL-UNREACHABLE-THEATER` — `PoliciesList` renders `PolicyCreateModal open={createOpen}` but no visible control ever sets it true; only the separate Wizard is reachable. Required leaves `insurance.modal.policy_create` + `insurance.parity.policy_create` stay OPEN. Reconcile duplicate creator ownership; never borrow Wizard Live proof. Board + audit row 964. OWNER-GATED=no.

CLAIM FE PICKER-LAW HANDOFF: `LV-LEGAL-MATTER-CLAIM-PICKER-CREATOR-DISABLED` — selected-USMCA `/legal/matters/new` uses canonical `EntityPicker kind="insurance_claim"`, but hard-codes `allowCreate={false}` even though the registry marks its inline creator available and the shared picker mounts `ClaimCreateModal`. Live listbox shows four human claims and no `+ Add new insurance claim` first row. Enable the existing canonical creator only; preserve intentionally unavailable lawsuit creation, entity scope, optional-null behavior, and money fields. Board + audit row 970. OWNER-GATED=no.

CLAIM FE/MATRIX SURFACE-HONESTY HANDOFF: `LV-DRIVER-HUB-REPORT-ISSUE-MODAL-MISOWNED-LEAF` — selected-USMCA Driver Hub has no Report Issue control. Source mounts `ReportIssueModal` only from driver-app `DriverLoadDetailPage`, while `driver-hub.required.json` assigns it to Driver Hub. Reconcile exact leaf ownership or mount a real canonical action with correct load context; no duplicate writer or borrowed proof. Board + audit row 988. OWNER-GATED=no. BLOCKS=LIVE-DRIVER-HUB-Z1.
