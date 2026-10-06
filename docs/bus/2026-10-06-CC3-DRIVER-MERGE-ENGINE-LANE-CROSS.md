# LANE_CROSS: CC-3, in-app driver merge engine: one driver-vendor profile per person (2026-10-06)

**Owner, 2026-10-06:** "What we do need to merge are the drivers that have multiple profiles in the app. Remember only one driver vendor profile, can have many Samsara usernames and accounts." Samsara law: "We do not change driver names in Samsara. We map various users from Samsara into one driver profile."

**Measured (prod, read-only plus a rolled-back proof):**
- 62 people have 69 extra driver profiles.
- 198 columns reference a driver. The old ops-script merge listed about 70 by hand, so documents and other references off that list stayed on the retired record.

**Root cause:** there was no merge engine. Merges were scripts with a hand-written table list, so every table added later fell outside the merge.

**Fix:** `apps/backend/src/mdata/driver-merge.service.ts`. Every merge goes through these steps, in one transaction:
1. **Discover references from the catalog** (FKs plus the `*_driver_(id|uuid)` naming convention). There is no hand list.
2. **Repoint each column inside a savepoint, measured.** Each column ends one of three ways:
   - `moved`;
   - `kept_on_survivor` — a unique conflict, because the survivor already has its own row;
   - `history_kept` — an immutable history table such as HOS or DOT inspections, which resolves to the survivor through `merged_into_driver_id`.
   Anything else refuses the whole merge.
3. **Escrow** moves through `createJournalEntryOnClient` + `recordEscrowPostingOnly`; balances are never edited directly.
4. **The duplicate's driver-vendor folds into the survivor's vendor**, so there is one driver-vendor profile per person.
5. **Samsara users follow the driver.** Only `mdata.driver_samsara_accounts.driver_id` and `integrations.samsara_drivers.local_driver_id` move. Samsara itself is never written.
6. **Post-check:** zero writable references to the merged record may remain, or the merge refuses.
7. **Retire the merged record** (`merged_into_driver_id`, Inactive) and write an audit event.

**Screen:** Drivers → "Duplicate profiles" (`/drivers/duplicates`).
- Owner-only.
- Each card is one person.
- Preview shows exactly what moves.
- Blockers stop the merge.
- Keeping the profile with fewer loads requires a reason.

**Guard:** `scripts/verify-driver-merge-engine.mjs` (step 18357), selftest 5/5.

**Files crossing lanes:**
- `drivers.routes.ts` registers the routes.
- `manifest.tsx` adds the route.
- `Drivers.tsx` adds the link.
- The escrow transfer posts a JE (CC-1 money lane) through the existing journal engine; no poster was added.

**CC-1 / CC-2:** nothing to do. This note is the record of the crossing.
