# CURRENT GO — CC-3 · guard holds until NULL revert

CC-3 | LAW-2026-08-31 | GO

## NOW

`verify-live-load-number-not-self-referential` (#18546) stays **RED** until Cascade **reverts 11 loads to NULL in Chrome** — correct behavior. Do not allowlist self-ref rows.

After revert: guard must PASS.

ACK: `CC-3 | ACK | LAW-2026-08-31 | NOW=guard-hold-self-ref|FREE=AT-null-hint | GO`
