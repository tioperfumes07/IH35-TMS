/**
 * Owner 2026-11-27 18:21 CT (via LEAD ROUND L.30): every bulk list in the perfume app is ParityTable `selectable` —
 * select all on the page, then "Select all N matching", and Export takes exactly the ticked rows.
 * Guard: every <ParityTable …> opening tag under pages/perfume carries `selectable`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(__dirname, "..");

/** The opening tag's props: from after `<ParityTable` (and its generic) to the first `>` outside braces and quotes. */
export function parityTags(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/<ParityTable\b/g)) {
    let i = m.index! + m[0].length;
    if (src[i] === "<") { let g = 0; do { if (src[i] === "<") g++; else if (src[i] === ">") g--; i++; } while (g > 0); }
    let d = 0, q: string | null = null, j = i;
    for (; j < src.length; j++) {
      const c = src[j];
      if (q) { if (c === q) q = null; }
      else if (d === 0 && (c === '"' || c === "'")) q = c;
      else if (c === "{") d++;
      else if (c === "}") d--;
      else if (c === ">" && d === 0) break;
    }
    out.push(src.slice(i, j));
  }
  return out;
}

describe("every perfume bulk list is selectable", () => {
  it("parityTags reads props past a generic and arrow functions", () => {
    expect(parityTags(`<ParityTable<Row> selectable rowKey={(r) => r.id} />`)[0]).toContain("selectable");
    expect(parityTags(`<ParityTable rowKey={(r) => r.id} />`)[0]).not.toMatch(/\bselectable\b/);
  });

  it("no <ParityTable> under pages/perfume is missing `selectable`", () => {
    const missing: string[] = [];
    let total = 0;
    for (const f of readdirSync(DIR).filter((x) => x.endsWith(".tsx"))) {
      const tags = parityTags(readFileSync(join(DIR, f), "utf8"));
      total += tags.length;
      tags.forEach((t, n) => { if (!/\bselectable\b/.test(t)) missing.push(`${f}#${n + 1}`); });
    }
    expect(total).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });
});
