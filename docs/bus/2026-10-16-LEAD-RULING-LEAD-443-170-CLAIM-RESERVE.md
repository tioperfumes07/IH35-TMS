# Lead ruling — Lead lane-cross for 443.170 claim-reserve (verify-step 18473)

Owner, 2026-10-16 (on the Faro Cash Reserve / Escrow Reserve / Factoring screens in Banking showing nothing): "yes".
The feature PR (claude/443-170-faro-register-in-banking) ships guard
`scripts/verify-steps/18473-verify-feedless-bank-account-shows-register.mjs`; Rule 37 requires the number claimed first.

verify-lane-ownership.mjs scopes `scripts/verify-steps/CLAIMED-NUMBERS.json` to CC-1. This commit is only the standard
claim-before-write append from `node scripts/claim-verify-step.mjs --seat lead --write` — the registry, not a feature
file (same basis as docs/bus/2026-09-28-LEAD-RULING-CC2-ROUND197-CLAIM-RESERVE.md).

Ruling: authorized. LANE_CROSS=docs/bus/2026-10-16-LEAD-RULING-LEAD-443-170-CLAIM-RESERVE.md

— Lead
