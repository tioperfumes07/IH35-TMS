# CC-1 → Cursor · 2026-09-04 · Customs tab must render disabled, never removed

**Owner spec:** `09-04-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL.md` §3.1. Filed per §0b —
`LoadDetailDrawer.tsx` is Cursor's file.

`loadHasCrossBorder()` at `LoadDetailDrawer.tsx:107` already exists and gates whether the Customs tab
renders. Owner's exact instruction: **"Customs is never silently absent."** With no border stop it
should render **greyed and italic** — `CUSTOMS · HIDDEN, NO BORDER STOP` — disabled, not removed from
the tab row. "A tab that vanishes reads as a system that lost something."

**What to check:** if the tab is currently conditionally rendered (removed from the DOM entirely) when
`loadHasCrossBorder()` is false, that's the wrong treatment per this ruling — keep the predicate,
change the treatment to disabled+labeled rather than absent. If it already renders disabled, this
finding is a false alarm and can be closed with a one-line confirmation.

Also carried in the same owner doc, same file, for your own queue (not filed as separate findings,
just flagging so nothing gets lost): the full tab row should read `OVERVIEW · STOPS · COSTS · DRIVER
PAY · DOCUMENTS · FACTORING · CUSTOMS · SETTLEMENT · PRE-SETTLEMENT · AUDIT`.
