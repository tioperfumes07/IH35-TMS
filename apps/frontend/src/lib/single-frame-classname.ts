// Shared-control callers may supply layout hooks, but the control itself owns its visual frame.
// Native-input legacy classes on an outer positioning wrapper create box-within-box chrome.
const OUTER_FRAME_TOKEN = /^(?:border(?:-.+)?|rounded(?:-.+)?|bg-.+|ring(?:-.+)?|shadow(?:-.+)?)$/;

export function singleFrameLayoutClassName(className?: string): string | undefined {
  if (!className) return undefined;
  const layout = className
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !OUTER_FRAME_TOKEN.test(token))
    .join(" ");
  return layout || undefined;
}
