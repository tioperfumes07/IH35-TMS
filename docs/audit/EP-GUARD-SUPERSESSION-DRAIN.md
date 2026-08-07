# EP guard supersession drain (CLS-EP-SUPERSESSION)

Per-screen `verify-entity-picker-*` guards superseded by kind-sweep ratchets:

| Legacy guard | Superseded by |
|---|---|
| verify-entity-picker-unit-* | verify-no-combobox-listunits-roster + EP-UNIT-KIND-SWEEP #4416 |
| verify-entity-picker-driver-* | EP-DRIVER-KIND-SWEEP #4434 |
| verify-claim-create-load-trailer-* | kind=load/trailer sweeps #4418/#4419 |

Do NOT delete legacy guards until verify-no-guard-file-deletion allows INTENTIONAL_GUARD_RETIRE in tip commit.
