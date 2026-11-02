# ENG-60 PARTIAL — 2026-10-28 CT

## Live
- `insurance.lawsuit` rowcount = **0** (empty — drop-eligible after FE cutover)
- `legal.matters` USMCA = **0**; `insurance_lawsuit_id` links = **0**
- `insurance.claim.lawsuit_id` column still present

## Remaining code
- `LawsuitsTab` still calls `listInsuranceLawsuits`
- PolicyDetail lawsuit section + ~17 guards that read `insurance.lawsuit`
- Point UI at legal matters; then drop table when 0 rows all entities
