# LANE_CROSS — CC-3 — many Samsara users, one driver profile: one canonical map (2026-10-05)

**Owner law (2026-10-05, verbatim):** "IN THE APP WE SHOULD MAP A SINGLE VENDOR-DRIVER TO MULTIPLE USERS FROM SAMSARA … WE DO NOT CHANGE DRIVER NAMES IN SAMSARA, THAT IS LAW, WE MAP VARIOUS USERS FROM SAMSARA INTO ONE DRIVER PROFILE." The owner confirmed two cases:
- LUIS CORONA is JORGE INFANTE CORONA.
- The two NEFTALI records are one driver.

**Files crossed (UNASSIGNED / CC-1 by path):**
- `apps/backend/src/integrations/samsara/driver-mapping/driver-mapping.routes.ts`
- `apps/backend/src/integrations/samsara/driver-mirror-collector.ts` and its test
- `scripts/verify-samsara-one-canonical-map.mjs` (step 18165, claimed #25513)
- the Samsara Mapping page and its API client

**Defect:** three answers to "which driver is this Samsara user":
- The page wrote integrations.samsara_drivers.local_driver_id.
- The engines read mdata.driver_samsara_accounts.
- The mirror collector used the legacy column plus license/name guesses, and deactivated a driver when any one of his Samsara users was retired.

27 USMCA Samsara users disagree between the two maps.

**Change:**
- map/unmap write the canonical row.
- An explicit "Same person" option retires the emptied duplicate driver record into the target.
- The collector resolves canonical-first and keeps a driver active while any of his Samsara users is active.
- Nothing writes to Samsara.
- No data was written by CC-3: the owner maps in the app.

**CC-1:** nothing to do. This note is the record of the crossing.
