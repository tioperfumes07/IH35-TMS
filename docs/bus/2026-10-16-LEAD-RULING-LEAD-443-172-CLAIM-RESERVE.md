# Lead ruling — Lead lane-cross for 443.172 claim-reserve (verify-step 18501)

Owner, 2026-10-16 15:20 CT (Factoring → Purchase report): the gear lacks Settlement and Load columns, and "Unknown
Customer" rows appear from 10-5-26. The feature PR (claude/443-172-purchase-report-lines) ships guard
`scripts/verify-steps/18501-verify-purchase-report-reads-purchase-lines.mjs`; Rule 37 requires the number claimed first.

verify-lane-ownership.mjs scopes `scripts/verify-steps/CLAIMED-NUMBERS.json` to CC-1; this is only the registry append from
`node scripts/claim-verify-step.mjs --seat lead --write` (same basis as 2026-10-16-LEAD-RULING-LEAD-443-170-CLAIM-RESERVE.md).

Ruling: authorized. LANE_CROSS=docs/bus/2026-10-16-LEAD-RULING-LEAD-443-172-CLAIM-RESERVE.md

— Lead
