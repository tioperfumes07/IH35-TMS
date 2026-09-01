import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function visibleJsxText(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/className=\{?`[\s\S]*?`\}?/g, "")
    .replace(/className="[^"]*"/g, "")
    .replace(/htmlFor="[^"]*"/g, "")
    .replace(/data-testid="[^"]*"/g, "")
    .replace(/id="[^"]*"/g, "")
    .replace(/\{`[\s\S]*?`\}/g, (m) => m)
    .replace(/form\.(register|setValue|watch|setError)\([^)]*\)/g, "")
    .replace(/values\.[a-z0-9_]+/gi, "")
    .replace(/"miles_[a-z]+"/g, "");
}

describe("Book Load operator English (GO-16 Rev B)", () => {
  it("has zero user-visible underscores on MilesStrip and the miles note", () => {
    const miles = readFileSync(join(here, "MilesStrip.tsx"), "utf8");
    const modal = readFileSync(join(here, "../BookLoadModalV4.tsx"), "utf8");
    const note = modal.match(/<p className="blw-note">[\s\S]*?<\/p>/)?.[0] ?? "";
    const visible = visibleJsxText(miles) + "\n" + visibleJsxText(note);
    const quoted = [...visible.matchAll(/>([^<{][^<]*)</g)].map((m) => m[1]);
    const withUnderscore = quoted.filter((t) => t.includes("_") && !t.includes("http"));
    expect(withUnderscore, withUnderscore.join(" | ")).toEqual([]);
    expect(miles).not.toMatch(/uppercase/);
    expect(miles).not.toMatch(/PC\*MILER/);
    expect(miles).not.toMatch(/fuel and ETA/i);
  });
});
