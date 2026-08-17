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

CLAIM FE/CHROME HANDOFF: `LV-USERS-ROOT-FILTER-PANEL-ABSENT` — selected-USMCA `/users` has Search/Range/gear but no Filters action or governed Apply/Cancel/Reset panel, while exact Required leaf `users:chrome.toolbar_filter` points to `pages/Users.tsx`. Add one meaningful staged filter panel or supersede only this exact leaf with applicability evidence; never render empty filter chrome. Board + audit row 989. OWNER-GATED=no. BLOCKS=LIVE-USERS-Z2.

CLAIM REPORTS API/FE HUMAN-LABEL HANDOFF: `LV-REPORTS-CUSTOMER-PROFITABILITY-RAW-UUID-LABELS` — selected-USMCA report API returns three unresolved customer UUIDs verbatim as `customer_name`; table renders `Customer — not visible`, chart leaks raw UUID. Remove UUID-as-name fallback, resolve authorized historical name or explicit non-UUID tombstone across table/chart/CSV/EntityLink, preserve report math. Board + audit row 995. OWNER-GATED=no. BLOCKS=LIVE-REPORTS-Z6.

CLAIM DEPLOY/INFRA HEALTH REGRESSION: `LV-SYSTEM-BACKGROUND-JOBS-STALE-DOWN-REGRESSION` — fresh selected-USMCA `/system?tab=software` on deployed backend `ea9f821` again reports exact check `background_jobs.stale=DOWN`; adjacent five applicable checks are OK. Inspect the deployed ledger/payload, name the exact stale job, fix scheduler/capability/source root cause, preserve honest DOWN semantics, and do not touch rows 425/633. Board + audit row 999. OWNER-GATED=no. BLOCKS=LIVE-SYSTEM-Z9.

CLAIM REPORTS ENTITYLINK RESIDUAL: `LV-REPORTS-CUSTOMER-PROFITABILITY-DEAD-TOMBSTONE-LINK` — PR #8156 removed UUID labels but three `Customer — not visible` rows remain active customer links; Live click reaches `/customers/45226738-fcfa-40f0-944d-574e6725bcd6` and renders `Failed to load customer details.` Render unresolved tombstones non-interactively while preserving real-customer drill-through; ratchet both branches and Live-prove. Board + audit row 1005. OWNER-GATED=no. BLOCKS=LIVE-REPORTS-Z6.

CLAIM FRONTEND DEPLOY DRIFT: `LV-USERS-ROOT-FILTER-DEPLOY-DRIFT` — current main contains #8146's governed Users Role filter, but selected-USMCA `/users` still has Search/Range/gear and no Filters action; served shell `assets/index-0juIMYDX.js`. Deploy/cache-bust current main, then Live-prove Filters opens Role panel with Reset/Cancel/readiness-disabled Apply. Do not rewrite product code. Board + audit row 1006. OWNER-GATED=no. BLOCKS=LIVE-USERS-Z2.

CLAIM CASH-FLOW RESPONSIVE PICKER FAILURE: `LV-CASH-FLOW-MANUAL-PROJECTION-PICKER-CLIPPING` — narrow selected-USMCA Manual Daily Projections keeps Unit reachable but clips the later Customer combobox; repeated real clicks time out, and Vendor/Driver shares the same fixed non-wrapping row. Make both create rows responsive while preserving canonical pickers/payload/order; ratchet narrow+desktop reachability. Board + audit row 1010. OWNER-GATED=no. BLOCKS=LIVE-CASH-FLOW-Z10.
CLAIM: `SYS-EDI-PICKER-APPLICABILITY-THEATER` — exact leaf `system.wizard.edi_setup:picker_law` at Live `https://app.ih35dispatch.com/integrations/edi`. Wizard exposes Partner name free text, then ISA/GS/connection enum/endpoint credentials; no canonical-entity field owes picker law. See GUARD-WORKORDERS + audit row 1022. Remove only the impossible Required cell with exact applicability ratchet; preserve connectivity and wizard behavior. OWNER-GATED=no; BLOCKS=LIVE-SYSTEM.
CLAIM: `FINANCE-LOAN-WIZARD-PICKER-APPLICABILITY-THEATER` — exact cells `nav.loan_wizard:picker_law` and `finance.wizard.loan_wizard_page:picker_law` at Live `https://app.ih35dispatch.com/finance/loan-wizard`. Wizard field universe is free-text Asset/VIN/Lender, MoneyInput fields, numeric rate/term and shared First-payment DatePicker; no canonical-entity FK owes picker law. See GUARD-WORKORDERS + audit row 1027. Remove only the two impossible Required cells with exact applicability ratchet; preserve both connectivity cells and all wizard behavior. OWNER-GATED=no; BLOCKS=LIVE-FINANCE-Z10.
CLAIM REPORTS COPY: `LV-REPORTS-IFTA-PREPARER-STALE-OWNER-APPROVAL-COPY` — selected-USMCA `/reports/ifta-preparer` visibly says `4-step wizard (mileage, fuel, tax, owner approval)`. Replace only the stale approval wording with accurate controlled-review language, preserve behavior, and mutation-ratchet the exact surface in the no-owner-approval product-copy guard. Board row filed. OWNER-GATED=no; BLOCKS=LIVE-REPORTS-Z6-IFTA-PREPARER.
CLAIM REPORTS ENTITYLINK RESIDUAL: `LV-REPORTS-CANCELLATIONS-DEAD-CUSTOMER-TOMBSTONE-LINK` — selected-USMCA `/reports/cancellations` renders `Unknown customer` id `01a29250-9bc1-4679-9613-79331056294d` as active link; target profile fails. Extend #8180's tombstone policy/guard to `CancellationsReportPage.bucketColumns`, preserving real driver/customer links. Board row filed. OWNER-GATED=no; BLOCKS=LIVE-REPORTS-CANCELLATIONS-REVERSE.
CLAIM REPORTS DATE CHROME: `LV-REPORTS-FUEL-RECONCILIATION-RAW-ISO-DATES` — selected-USMCA `/reports/fuel-reconciliation` renders unmatched Card date `2026-08-12` raw; both `transaction_date` and `wo_date` columns have no display renderer. Use canonical date display while preserving raw sort/filter/export values; ratchet both exact consumers independently. Board filed. OWNER-GATED=no; BLOCKS=LIVE-REPORTS-FUEL-RECON-QBO-CHROME.
