// Canonical QuickBooks-density form input classes (DENSITY-SWEEP-QB).
//
// One shared standard so every detail/edit form input has identical, compact
// QB-style proportions. Matches the dominant existing compact input signature
// already used across the app (h-9 = 36px, 13px font), so migrating to these
// does not introduce a new size token.
//
// h-9 (36px) fixed height keeps every input the same height and is an adequate
// tap target; text-[13px] is the QB-density font size.
export const FORM_INPUT_CLASS = "h-9 w-full rounded border border-gray-300 px-2 text-[13px]";

export const FORM_SELECT_CLASS = FORM_INPUT_CLASS;

// Textareas grow with content, so no fixed height; py-1.5 = 6px vertical padding.
export const FORM_TEXTAREA_CLASS = "w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]";
