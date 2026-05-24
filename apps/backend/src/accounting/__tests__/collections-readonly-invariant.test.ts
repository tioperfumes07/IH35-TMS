import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const servicePath = path.resolve(__dirname, "..", "collections.service.ts");

describe("collections readonly invariant", () => {
  it("does not import posting engine or QBO writer modules", () => {
    const source = fs.readFileSync(servicePath, "utf8");
    const sourceFile = ts.createSourceFile(servicePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const forbidden = [/posting-engine/i, /journal-entry-qbo-push/i, /qbo-writer/i, /journal_entries/i];
    const imports: string[] = [];
    sourceFile.forEachChild((node) => {
      if (!ts.isImportDeclaration(node)) return;
      const text = node.moduleSpecifier.getText(sourceFile).replace(/^["']|["']$/g, "");
      imports.push(text);
    });
    for (const pattern of forbidden) {
      expect(imports.some((value) => pattern.test(value))).toBe(false);
    }
  });
});
