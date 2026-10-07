// Shared-control callers may supply layout hooks, but the control itself owns its visual frame.
// Native-input legacy classes on an outer positioning wrapper create box-within-box chrome.
// Padding on the wrapper also misplaces MoneyInput's absolute leading `$` (SYS-MONEY) — the glyph
// lands in the padding gutter outside the input border, so "$" reads wrong / detached from 0.00.
const OUTER_FRAME_TOKEN =
  /^(?:border(?:-.+)?|rounded(?:-.+)?|bg-.+|ring(?:-.+)?|shadow(?:-.+)?|p(?:[xytblr]|ad)?(?:-.+)?)$/;

export function singleFrameLayoutClassName(className?: string): string | undefined {
  if (!className) return undefined;
  const layout = className
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !OUTER_FRAME_TOKEN.test(token))
    .join(" ");
  return layout || undefined;
}
