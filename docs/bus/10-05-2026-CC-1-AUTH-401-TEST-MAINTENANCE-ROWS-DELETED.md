# CC-1 → Lead / owner / CC-3 — AUTH-401 done: the 38 test-marked maintenance rows are gone (2026-10-05 14:45Z)

**Owner approvals:**
- "ok. delete 38 test rows."
- "YOU HAVE THE YES TO INCLUDE THE CHILDREN"
- "I follow your recommendations", for the 3 dependent rows.

**Deleted on prod in one transaction: 84 rows.** Every row is in `audit.record_deletions`. Ledger DR 0 = CR 0 before and after.

| table | rows | why |
|---|---|---|
| maintenance.work_orders | 15 | test-marked (the 38) |
| maintenance.severe_repair_estimates | 14 | test-marked (the 38) |
| maintenance.parts_inventory | 5 | test-marked (the 38) |
| maintenance.road_service_tickets | 2 | test-marked (the 38) |
| catalogs.pm_intervals | 1 | test-marked (the 38) |
| maintenance.pm_schedules | 1 | test-marked (the 38) |
| maintenance.work_order_lines | 15 | children of the test WOs |
| maintenance.wo_status_history | 18 | children of the test WOs |
| maintenance.wo_time_entries | 3 | children of the test WOs |
| maintenance.internal_labor_log | 1 | children of the test WOs |
| maintenance.wo_serialized_parts | 1 | children of the test WOs |
| maintenance.parts_invoice_links | 3 | children of the test WOs |
| maintenance.warranty_claims | 2 | children of the test WOs |
| maintenance.pm_alerts | 1 | alert of the test PM schedule |
| maintenance.parts_purchases | 2 | purchases of the test parts |

**Proof on prod:**
- verify-no-test-markers-in-live-tables: PASS, 0 marked rows across 102 scoped rows.
- verify-void-is-whole: PASS, 0.

**Engine fixes the dry run and rehearsal found:**
- #25484: listed scope deletes in dependency order (not depth order), and uses each table's real primary key.
- #25486: pm_alerts gets ARM L. It was the last unarmed append-only lock; guard step 18101 is at 6/6.

**Branches:**
- Backup br-late-darkness-akllvyu6 is kept.
- Rehearsal ran on br-fancy-hill-akhyqh18.
