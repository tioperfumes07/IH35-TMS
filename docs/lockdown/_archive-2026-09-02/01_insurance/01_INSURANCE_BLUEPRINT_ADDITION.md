# UNIFIED_BLUEPRINT_ADDITIONS.md — append this dated section

## 2026-06-07 — INSURANCE module locked (top-level, multi-vehicle policy creator)

STATUS: APPROVED BY JORGE (preview locked 2026-06-07). ADDITIVE ONLY. Supersedes any
"Insurance buried under Compliance" wording. Source preview: preview-insurance.html.

### Navigation
- Insurance is a TOP-LEVEL sidebar item.
- Position: index 8, immediately AFTER "drivers / DRIVER PROFILE" and BEFORE "eld / ELD".
- Icon: shield/umbrella. Label: INSURANCE.
- NEVER remove. NEVER reorder existing items. Insurance is inserted, nothing else moves
  except shifting down by one.

### Insurance landing — /insurance (tab: Policies)
- Header: "Insurance" / sub "Policies, claims, lawsuits, coverage gaps for all units and drivers".
- Primary action button: "+ Create policy"  (locked vocabulary — NEVER "+ New", NEVER "+ Add").
- KPI row (single line): Active policies · Units covered (n/total) · Premium / mo · Expiring <60d · Open claims.
- Tabs: Policies · Claims · Lawsuits · Coverage gaps · Carriers · Settings.
- Policies table columns (locked): Policy # · Carrier · type · Units · Coverage · Term · Premium / mo · Status.
  - Status badge values: Active, Expires <Nd> (amber when <60d), Expired, Cancelled.
  - Units cell shows count pill(s) + operating-company pill (TRK / TRANSP / USMCA).

### Create-policy wizard (4 steps) — the locked behavior
- Step 1 Carrier & type: carrier, policy type/coverage, policy number, effective date.
- Step 2 Select vehicles: MULTI-VEHICLE selector.
  - Searchable by unit / VIN / driver. Filter chips: All · Tractors · Trailers · Reefer · TRK · TRANSP (· USMCA hidden until launch).
  - Live "N of <fleet> selected" count. Cannot proceed past Step 2 with 0 vehicles.
- Step 3 Premium & term: total premium + term (months) + allocation method.
  - Allocation methods: Equal split (DEFAULT) · Pro-rata by value · Weighted custom %.
  - System auto-computes and DISPLAYS **cost per vehicle insured per month** = monthly_premium / selected_units
    (equal split) or per allocation method. Recomputes whenever premium, term, OR selected vehicles change.
- Step 4 Review bills: shows the auto-generated monthly bill schedule (N = term months), each = premium/term,
  with per-unit-per-month cost, total, unit count. Action: "Create policy + schedule N bills".

### What "Create policy" writes (ONE atomic DB transaction)
- insurance.policies (1 row): operating_company_id, carrier, type, policy_number, effective, expires,
  total_premium, term_months, allocation_method, is_active=true. Audit row. Soft-delete via is_active (ARCHIVE never DELETE).
- insurance.policy_units (1 row per selected vehicle): policy_uuid -> unit_uuid, cost_per_month, effective, expires.
  RLS-scoped on operating_company_id; cross-OCI rejected at constraint level.
- Scheduled bills (term_months rows): vendor=carrier, gl_account=insurance expense, amount=monthly,
  due_date, period, linked_policy_uuid, status='scheduled', idempotency_key per bill. QBO outbox sync (idempotent).
  Bills flow through the EXISTING accounting service functions — NO new financial code.

### Downstream
- Per-unit cost_per_month feeds per-load P&L (S5-A): each active load carries its daily-pro-rated insurance burden.
- Claims/Lawsuits tabs link to safety.accident_records (WF-027 multi-policy separation) — multiple claims per accident allowed.
- Every insert/update writes audit row (before/after JSON).

### Acceptance (locked)
1. Insurance appears at sidebar index 8 (after Driver Profile). Nothing else removed/reordered.
2. "+ Create policy" wording (never New/Add).
3. Multi-vehicle selector; blocks proceed with 0 vehicles.
4. Cost-per-vehicle-insured shown and recomputes on premium/term/vehicle change.
5. Equal split default; pro-rata + weighted available.
6. Create = single tx: policy + N policy_units + (term) scheduled bills, idempotency-keyed, QBO outbox.
7. ARCHIVE never DELETE (is_active flag).
8. Audit row on every write.
