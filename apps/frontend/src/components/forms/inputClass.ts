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
// Owner design law rule 2: 40px for a field being edited in a form (was h-9 / 36px — off the law, 10-25-2026).
export const FORM_INPUT_CLASS = "h-10 w-full rounded-sm border border-gray-300 px-2 text-xs";

export const FORM_SELECT_CLASS = FORM_INPUT_CLASS;

// Textareas grow with content, so no fixed height; py-1.5 = 6px vertical padding.
export const FORM_TEXTAREA_CLASS = "w-full rounded-sm border border-gray-300 px-2 py-1.5 text-xs";

// LEAD 443.365-C (owner 10-25-2026 4:05 PM "the creators are wrong not correctly formatted") — ONE field-label style
// for every creator: 11px (the locked `.text-section-header` size, no raw px), 600, muted #64748B (design law token
// "Muted — labels, sub-copy"). Sentence case on purpose: a label that WRAPS its field would hand uppercase/tracking to
// the typed value and its error text. Inline checkbox labels are a different element and keep their own class.
export const FORM_LABEL_CLASS = "block text-section-header font-semibold text-[#64748B]";
/** Same label when it wraps its field (label > text + input + error), stacked with a 4px gap. */
export const FORM_LABEL_STACK_CLASS = "flex flex-col gap-1 text-section-header font-semibold text-[#64748B]";
