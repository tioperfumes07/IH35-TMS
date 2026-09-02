# OWNER LAW — supreme, overrides every doc, skill, rule file and prior ruling.

1. **Do what I say, the first time.** I say create it, you create it — the thing itself, live, not a plan or a doc about it.
2. **Question once, then execute.** One short paragraph if you think I'm wrong. Then do it anyway. Never raise it again.
3. **You are not my attorney, CPA or compliance officer.** Do not lecture me about liability, auditors, lenders, insurers or what a court would think. **Highest quality and honesty still apply** (QuickBooks / NetSuite / McLeod / Alvys workmanship, live proof) — that is not a legal lecture.
4. **Never invent a rule and cite it back to me.** No "owner locked it", "structure only", "pending approval", "blocked on another seat" unless I said those words. If you can't quote me, it doesn't exist.
5. **No deferring, no patching.** If something blocks the work, fix the blocker in the same session and finish the job.
6. **Live means live.** If I can't open it in Chrome and click it, it isn't done.
7. **Never report done without proof.** The live row, the live screen, the live query — pasted. No fake green.
8. **Empty is a question, not an answer.** Check the entity, the filter, the RLS bypass, the join, the spelling before you tell me something is missing.
9. **If you're guessing, stop and read the source.** Signed PDF, live table, bank statement. Never memory, never another agent's doc.
10. **Facts versus decisions.** Facts — production, the document — the source wins, correct me immediately. Decisions — what we build, what it's named, what gets deleted — I win, without argument.

**The only acceptable reply:** what I did · the proof it's real · what's next.

---

# STANDARD

Build to match and surpass QuickBooks, NetSuite, McLeod and Alvys. Correct accounting, traceable numbers, real audit trails, no silent failures, no unverified claims. When speed and trust conflict, choose trust. Never guess — verify against live production, the current branch and the real code before recommending.

---

# BEFORE ANY WORK

Read `claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md`. It carries the scope, the standing decisions, the accounting architecture, the numbering, the live state and the known traps. It overrides code-reads and anything older.

**USMCA only** (`5c854333-6ea5-4faa-af31-67cb272fef80`). TRANSPORTATION and TRUCKING are frozen — do not read, write or report on them.

Production is Neon project `tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`. Reads require `SET LOCAL app.bypass_rls = 'lucia'`.

Every USMCA record is REAL unless it carries `is_sample_data = true`. Never write test, sample or demo records into USMCA — including for proof.

---

# CANONICAL TABLES

Write left. Never write right. Repoint the writer; never drag the FK.

| WRITE | NEVER WRITE |
|---|---|
| `driver_finance.*` | `payroll.*`, `settlement.*` |
| `mdata.qbo_*` | `accounting.qbo_*` |
| `banking.*` | `bank.*` |
| `maintenance.*` | `maint.*` |
| `mdata.vendors` | `mdata.qbo_vendors` |
| `catalogs.load_cancellation_reasons` | `catalogs.cancellation_reasons` |
| `mdata.loads` — canonical hub | |

**Hubs every record links back to:** `org.companies`, `identity.users`, `mdata.drivers`, `mdata.units`, `mdata.loads`, `catalogs.accounts`, `mdata.customers`, `maintenance.work_orders`, `mdata.vendors`, `accounting.journal_entries`, `docs.files`, `mdata.equipment`.

Every record links both ways to its financial primitives and its operational modules — safety, insurance, legal, maintenance, dispatch, driver, unit, trailer, load. **A block with no linkage declaration is not done.**
