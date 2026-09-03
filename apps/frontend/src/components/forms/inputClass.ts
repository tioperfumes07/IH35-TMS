// Canonical QuickBooks-density form input classes (DENSITY-SWEEP-QB).
//
// One shared standard so every detail/edit form input has identical, compact
// QB-style proportions.
//
// GO-21 J1 (2026-09-02): this constant used to hardcode the input font at the
// off-scale 13px it inherited from the dominant pre-J1 pattern. J1 locks body
// text at 12px system-wide (docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md) -- moved
// onto that locked size here so every consumer inherits the fix in one place
// instead of needing its own literal-by-literal batch.
//
// h-9 (36px) fixed height keeps every input the same height and is an adequate
// tap target; text-xs is the locked 12px body size.
export const FORM_INPUT_CLASS = "h-9 w-full rounded-sm border border-gray-300 px-2 text-xs";

export const FORM_SELECT_CLASS = FORM_INPUT_CLASS;

// Textareas grow with content, so no fixed height; py-1.5 = 6px vertical padding.
export const FORM_TEXTAREA_CLASS = "w-full rounded-sm border border-gray-300 px-2 py-1.5 text-xs";
