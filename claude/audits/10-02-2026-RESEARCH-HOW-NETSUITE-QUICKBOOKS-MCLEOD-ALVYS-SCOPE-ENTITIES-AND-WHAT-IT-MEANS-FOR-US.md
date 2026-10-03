# Research — how NetSuite, QuickBooks, McLeod and Alvys scope entities, and what it decides for us

Researched 2026-10-02. Primary sources cited. Where a vendor does not publish the internal design, that is stated rather than inferred.

---

## 1. NetSuite OneWorld — one subsidiary field, one subsidiary per transaction

Oracle's own documentation, *Subsidiaries in OneWorld*:

> "Each OneWorld transaction generally posts to a single subsidiary, with the exception of transactions between two or more subsidiaries."

The exceptions Oracle names are explicitly modelled features, not loose data: intercompany sales and purchases, intercompany inventory transfers, cross-subsidiary fulfillment and return, and advanced intercompany journal entries.

**What this establishes:** the entity is ONE field on the record, it is singular, and crossing entities is a named transaction type with its own rules — never the same field meaning two things, and never two fields competing to say which entity owns the row.

Oracle's public help does not document the internal column name or how role restriction is implemented at the storage layer. I am not going to invent it. What is documented and sufficient is the shape: one subsidiary dimension per record, intercompany handled as an explicit construct.

**Our equivalent:** `operating_company_id` is that one field. `tenant_id` is a second field claiming the same thing. In NetSuite terms we currently have two subsidiary fields on fifteen tables, which NetSuite's model does not permit at all.

## 2. QuickBooks — the entity boundary is the company file itself

Intuit's own community guidance and the consistent third-party reading of it: QuickBooks Online does not combine legal entities in one set of books. Each company is a separate company file with its own subscription; consolidated reporting across entities is done by a third-party tool reading several files, not by a company column inside one file.

**What this establishes:** the owner's 25-year trust benchmark enforces entity separation by making it structurally impossible to mix — there is no column to get wrong, because there is no shared table. Separation is the default state, not a filter applied afterward.

**Our equivalent:** we chose a single database with a company column, which is the right call for a three-carrier operation that shares drivers, units and loads — QuickBooks's model cannot express a tractor owned by TRK and leased to USMCA. But it means **the column is doing the work the file boundary does in QuickBooks.** If the column is ambiguous, we have given up the one guarantee QuickBooks gives for free. A second competing column is not a minor inconsistency; it is a hole in the only wall we have.

## 3. McLeod LoadMaster — multi-company is a product feature, internals not published

McLeod's public material presents LoadMaster as supporting multi-company operations and segregated financials for carriers running several entities. McLeod does not publish its schema, column names, or access-control implementation, and I found no primary source that documents them.

**Honest conclusion:** I can state that multi-company operation is a supported capability. I cannot cite how McLeod stores or enforces it, and I will not guess at a competitor's internals to justify a decision about our own. The decision below does not rest on McLeod.

## 4. Alvys — subsidiary as a first-class, unlimited dimension

From Alvys's own enterprise page:

> "Add unlimited subsidiaries at no extra cost."

**What this establishes:** the modern TMS treats the subsidiary as a built-in dimension of the record, not a deployment per entity, and does not charge or restrict by entity count. Alvys does not publish how data is separated between subsidiaries.

**Our equivalent:** our three carriers plus room for more is the same model. It only works if the dimension is unambiguous.

## 5. The engineering standard — and two facts from the PostgreSQL manual that decide this

Where the vendors stop publishing, the database's own documented behaviour takes over. Two things from the official PostgreSQL manual, `CREATE POLICY`, are decisive and are not matters of opinion:

**Fact one — permissive policies are OR'd:**

> "All permissive policies which are applicable to a given query will be combined together using the Boolean 'OR' operator."

> "When a mix of permissive and restrictive policies are present, a record is only accessible if at least one of the permissive policies passes, in addition to all the restrictive policies."

Three of our tables carry one permissive policy on `operating_company_id` and a second permissive policy on `tenant_id` — `factoring.customer_factor_assignment`, `factoring.factor`, `factoring.letter_of_release`. Both compare to the same session variable. By the manual's own rule, the effective policy on those three tables is **visible if either column matches.** The day the two columns disagree on a row, that row is visible to two carriers at once. This is not a risk assessment; it is what the documented operator does.

**Fact two — a NULL policy expression hides the row:**

> "When a USING expression returns true for a given row then that row is visible to the user, while if false or null is returned then the row is not visible."

Our `insurance.payment_schedule` row has `tenant_id` = USMCA and `operating_company_id` = NULL. Its policy keys on `operating_company_id`. NULL is not true, so **no carrier can see that row.** A real USMCA insurance payment schedule, invisible to the application and to every company-scoped report, visible only under the lucia bypass. Measured, and explained exactly by the documented behaviour.

**Fact three — from the practitioner literature, on indexes:** the widely repeated RLS guidance is that every index must *lead* with the scoping column or the planner scans rows the policy will then discard. Our key sweep found 183 business-key unique indexes that do not contain the scoping column at all. That is the same defect family, and it is why the sweep and this merge are one piece of work, not two.

## 6. What the research actually decides

Across all four systems the pattern is identical, and none of them has an exception:

| | entity boundary | how many scope fields per record |
|---|---|---|
| QuickBooks | the company file | zero — separation is structural |
| NetSuite OneWorld | the subsidiary field | exactly one, intercompany is a named type |
| Alvys | the subsidiary dimension | one, unlimited values |
| McLeod | multi-company (internals not published) | not documented |
| **IH35-TMS today** | `operating_company_id` … **and `tenant_id`** | **two, on 15 tables** |

**No serious system in this market carries two competing entity columns.** There is no vendor pattern to point at that would justify keeping both, and the PostgreSQL manual says plainly what keeping both does to row visibility.

So the merge is not a preference and not a cleanup. Every benchmark the owner named enforces exactly one entity dimension per record, and our database currently enforces neither of ours.

## 7. The one place our model must go further than NetSuite's

NetSuite handles the cross-entity case with explicit intercompany transaction types. We have the same need and more of it: a tractor owned by TRK, leased to USMCA, running a USMCA load, settled to a driver paid by USMCA, insured on a TRK policy. The 8000/8001 inter-company accounts and the composite same-entity foreign keys already in the schema are the right instinct.

Two of those composite constraints are built on `tenant_id`:

    factoring.canonical_factor_agreements
      (tenant_id, factor_profile_id) -> factoring.factor
      (tenant_id, factor_vendor_id)  -> mdata.vendors

They make it structurally impossible for a factor agreement in one carrier to reference a factor profile or vendor belonging to another. That is NetSuite-grade thinking, and it is the pattern the rest of the schema should adopt once the column is merged — which is precisely why the merge must **rename and rebuild**, never drop and re-add. Dropping `tenant_id` would take that protection with it.

## 8. Sources

- Oracle NetSuite, *Subsidiaries in OneWorld* — https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N268563.html
- Oracle NetSuite, *Defining Subsidiaries for OneWorld Transactions* — https://netsuitedocumentation1.gitlab.io/netsuitedocumentation1/section_N550454.html
- Intuit QuickBooks Community, multiple companies under one account — https://quickbooks.intuit.com/community/account-management-7/can-i-add-multiple-companies-in-online-qk-with-the-simple-start-75311
- Intuit QuickBooks Community, tracking multi-entity — https://quickbooks.intuit.com/community/reports-and-accounting-5/how-do-i-track-multi-entity-in-quickbooks-59564
- Alvys, *Enterprise TMS Software* — https://alvys.com/enterprise-tms-software
- McLeod Software, *Solutions* — https://www.mcleodsoftware.com/solutions/
- PostgreSQL manual, *CREATE POLICY* — https://www.postgresql.org/docs/current/sql-createpolicy.html
- Patotski, *Postgres Row-Level Security for Multi-Tenancy: The Pattern and the Footguns* — https://patotski.com/blog/postgres-row-level-security-multi-tenant/
