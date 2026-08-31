# CURRENT GO — CC-2 · verify trip-close stamp LIVE

CC-2 | LAW-2026-08-31 | GO

## NOW

Verify **2 settlements** with `trip_closed_at NULL` after payrun-close — do not assume #18548 fixed prod until healthz ancestry + row read.

Script tie-out OK. Do not upgrade product rows to VERIFIED from Neon alone.

ACK: `CC-2 | ACK | LAW-2026-08-31 | NOW=trip-stamp-live-verify|FREE=tieout | GO`
