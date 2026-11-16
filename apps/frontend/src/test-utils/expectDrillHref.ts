import { expect } from "vitest";

/**
 * A drill link goes to `target` and carries the page it was opened from as `ret` (withReturnContext), so Back returns
 * there. Asserts the target path and its own params exactly, and that `ret` is a safe internal path.
 */
export function expectDrillHref(el: Element, target: string): void {
  const href = el.getAttribute("href") ?? "";
  const url = new URL(href, "http://x");
  const ret = url.searchParams.get("ret");
  url.searchParams.delete("ret");
  const want = new URL(target, "http://x");
  expect(url.pathname).toBe(want.pathname);
  expect(Object.fromEntries(url.searchParams)).toEqual(Object.fromEntries(want.searchParams));
  expect(ret, `drill ${href} carries no ret= origin`).toMatch(/^\//);
}
