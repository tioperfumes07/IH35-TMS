# LANE_CROSS — CC-3 — post-purge shrink-only ratchets (2026-10-04)

The AUTH-400 purge (CC-1, committed on prod 2026-10-04, verify-void-is-whole 0) removed every row that shrink-only debt
lists named. Each such guard now demands its list shrink ("remove it … shrink-only"), and it reds every seat's gate.
Standing order "main green first" + Lead ACCT-F406 (guards may only shrink, never be widened). Only entries the purge
removed are taken out; no threshold is raised.
