# SAFETY-USMCA-DUPLICATE-DRIVER-MERGE-CANDIDATE-LIST

Filed by CC-3, 2026-09-04, per owner packet PART 4 ("Duplicates remain... File the merge
candidates for the owner — never merge a driver on a name guess"). USMCA only
(`5c854333-6ea5-4faa-af31-67cb272fef80`) — TRANSP (`91e0bf0a-133f-4ce8-a734-2586cfa66d96`) rows
for the same names exist too but are frozen/out of scope for this filing and not touched.

**Nobody merges a row from this list without the owner's word on which row survives.** Void the
loser, never delete, per standing law.

## Already resolved (no action needed)

| Person | CDL | Rows | Status |
|---|---|---|---|
| ANGEL ALFONSO SOSA | TAMP220307 | `2ee70f40` (void), `fba21d80` (active) | Merged 2026-09-03, owner-approved, per `2ee70f40`'s own audit note. `fba21d80` is the survivor (already the driver on load 13508). |

## Confirmed same person — CDL match, awaiting owner's survivor pick

| Person | CDL | Row A | Row B | Notes |
|---|---|---|---|---|
| Raul Esmeregildo Perez | 20263532 | `bc8d15a0-d996-4e9a-bec0-1817836668b3` (created 2026-07-04, deactivated 2026-07-30, no Samsara id) | `ba75a6cf-50fa-4056-bba2-1bcede88fad7` (created 2026-08-21, deactivated 2026-09-04, Samsara `54160216`) | Same CDL number — real duplicate. Both rows are currently deactivated; nobody is driving under either today. Recommend `ba75a6cf` as survivor (carries the Samsara id, more recent activity) but the owner decides. |

## NOT confirmed — do not merge on the name alone

| Person | Row A | Row B | Why it's not a CDL match |
|---|---|---|---|
| ARMANDO PEREZ | `7e7d5460-f6ed-44b9-b6a2-3683daba01e0` (CDL `TAMP240482`, no Samsara id) | `b069765d-7735-48c7-aa1d-7d75b83aaade` (CDL **NULL**, Samsara `57287703`) | Row B has no CDL number to cross-check against Row A's. Same first/last name and both deactivated 2026-07-30/2026-09-04, but "CDL is the identity" (owner law) and there is nothing here that proves these are the same physical person rather than two different Armando Perezes. Needs a human check (a second identity field — CURP, DOB, phone — or the owner's own knowledge) before this becomes a merge candidate, not before. |

## Reconciling the packet's counts

The owner packet said "ANGEL ALFONSO SOSA 3 rows, Raul Esmeregildo Perez 3, Armando Perez 3, Ruben
Pedro Perez Garcia 2" — those counts are correct **across both TRANSP + USMCA combined**. Per
company: Angel/Raul/Armando each carry 2 USMCA rows + 1 TRANSP row; Ruben carries exactly **1**
USMCA row (`1ec7654c-1ae9-4f3d-9af6-af9fd4b6bcc9`, CDL `DF00164972`, deactivated 2026-09-02) + 1
TRANSP row (`ba5ce08e-07b9-4596-8d57-8990a5f4abda`, same CDL, active in TRANSP). **There is no
USMCA-internal duplicate for Ruben** — nothing to file for him under this entity; his "2" only
exists once TRANSP is counted in, and TRANSP is frozen this session.

## Source

Live-verified `mdata.drivers`, Neon `tiny-field-89581227`/`br-fancy-credit-akjnd07a`, bypass_rls,
2026-09-04. Re-run before acting — void/deactivation timestamps on these rows are recent (some as
of today) and may have moved again by the time this is read.
