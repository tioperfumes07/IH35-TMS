FINDING: MILES-INVERT-01 Book Load popup fired on **every** reverse-lane fill. Owner law triggers only when **short > practical** OR reverse-lane short differs by **>100mi** — CC-1 migration #19755 already computes `short_miles_untrustworthy` on `catalogs.lane_mileage`.

ROOT CAUSE: lane-mileage GET did not expose the catalog trust columns; FE used blanket `fill_confidence === "reverse"` for popup.

FIX: `lane-mileage.service.ts` returns `short_miles_untrustworthy` + `short_miles_untrustworthy_reason`; Book Load `MilesInvertAckDialog` / `MilesStrip` use `milesUntrustworthyFlags()`.

GUARD: `lane-mileage.service.test.ts` untrustworthy passthrough; `BookLoadModalV4.test.tsx` column inversion + reverse >100mi popup tests.

LIVE PROOF: `npx vitest run apps/backend/src/dispatch/__tests__/lane-mileage.service.test.ts` — 11/11 pass.

REMAINING: CC-2 live Chrome verify on flagged lane; CC-1 catalog remediation continues. Bus bump OUTBOX-CURSOR + INBOX-CC-1 purge ping.

Law: USMCA only · NEVER POST Book Load · no seat fixtures.
