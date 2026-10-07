# LEAD RULING — Cursor SETL-F441 lane cross (2026-10-07)

Owner ordered Settlement Creator UX + miles root-cause fix NOW (never defer). Cursor owns
Settlement Creator. This PR also touches shared chrome that other seats consume:

- `EntityPicker` / `Combobox` — listCapNotice (cap honesty inside open listbox only)
- `StateSelect` — Combobox size=sm filter chrome (no caret)
- `ConfirmDiscardDialog` — pin w-[320px] rounded-sm (owner: normal dialog, not fullscreen)
- `single-frame-classname` — strip padding so MoneyInput `$` is QBO-correct

LANE_CROSS authorized for this PR only. Money math / posting / GL unchanged. No baseline grow.
Authority: owner chat 2026-10-07 + FAST-MERGE 4-min law.
