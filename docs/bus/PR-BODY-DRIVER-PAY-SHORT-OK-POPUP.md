FINDING: MILES-INVERT-01 Book Load OK popup FE
LANE: NON-FINANCIAL + FE (Book Load chrome)

SOURCE-OF-TRUTH: Jorge owner ruling 2026-09-02 — autofill + flag + OK-only popup; driver pay = short always
I QUERIED:       BookLoadModalV4 + MilesStrip on origin/main; bus docs already updated #19745/#19746
NOT CHECKED:     Live Chrome 13508 (CC-2 verify-live)

ROOT CAUSE: Bus law landed on main (#19745/#19746) but Book Load chrome had no OK-only popup or inline inversion flag. MilesStrip still said short includes empty.

FIX: Book Load wizard autofill three fields unchanged; inline flag when short>practical; OK-only dialog (no Esc/backdrop/X). MilesStrip copy corrected. Driver pay law unchanged (short always).

DOD-A: N/A
DOD-B: N/A
DOD-C: N/A
DOD-D: N/A
DOD-E: N/A
VERIFY-1: N/A
VERIFY-2: N/A
VERIFY-3: N/A
VERIFY-4: N/A
VERIFY-5: N/A
VERIFY-6: N/A
VERIFY-7: N/A
VERIFY-8: N/A
MODULE_PROGRESS: N/A — Book Load miles UX FE
GUARD: N/A — no lane_mileage mass correction
REMAINING: CC-2 Chrome-prove 13508; CC-1 catalog remediation
LIVE PROOF: BookLoadModalV4.test.tsx inverted-lane OK popup test

## Test plan
- [x] Autofill practical/short/empty unchanged on lane lookup
- [x] Inline flag when short > practical
- [x] OK-only popup; dismiss only via OK button
- [x] MilesStrip copy: short pays driver; empty is company cost
- [x] BookLoadModalV4 unit test for Indy→Laredo inversion
