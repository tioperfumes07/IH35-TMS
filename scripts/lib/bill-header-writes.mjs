// LEAD 443.182 C — every accounting.bills header is written by ONE writer, insertBillHeaderOnClient (bills.service.ts),
// called with the exact column list each caller used to INSERT inline. Guards that pin "this file's bill INSERT carries
// column X" read both shapes through this helper so the law they enforce is unchanged:
//   - inline  `INSERT INTO accounting.bills ( col, col, … )`   (any file that still writes directly — must be the writer)
//   - writer  `insertBillHeaderOnClient(client, [ ["col", { … }], … ])`
// The writer's own dynamic template (`INSERT INTO accounting.bills (${names.join(", ")})`) is not a caller and is skipped.

/** End index (exclusive) of the bracket that opens at `open`, skipping strings / template literals / comments. */
function matchBracket(src, open) {
  const pairs = { "[": "]", "(": ")", "{": "}" };
  const stack = [pairs[src[open]]];
  let i = open + 1;
  while (i < src.length && stack.length) {
    const ch = src[i];
    const two = src.slice(i, i + 2);
    if (two === "//") { i = src.indexOf("\n", i); if (i < 0) return src.length; continue; }
    if (two === "/*") { i = src.indexOf("*/", i + 2); if (i < 0) return src.length; i += 2; continue; }
    if (ch === '"' || ch === "'") {
      i += 1;
      while (i < src.length && src[i] !== ch) i += src[i] === "\\" ? 2 : 1;
      i += 1;
      continue;
    }
    if (ch === "`") {
      i += 1;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") { i += 2; continue; }
        if (src.slice(i, i + 2) === "${") { i = matchBracket(src, i + 1); continue; }
        i += 1;
      }
      i += 1;
      continue;
    }
    if (pairs[ch]) stack.push(pairs[ch]);
    else if (ch === stack[stack.length - 1]) stack.pop();
    i += 1;
  }
  return i;
}

/** Remove // and block comments outside strings (so a commented-out column never counts). */
function stripComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") { const j = src.indexOf("\n", i); i = j < 0 ? src.length : j; continue; }
    if (two === "/*") { const j = src.indexOf("*/", i + 2); i = j < 0 ? src.length : j + 2; continue; }
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Every bill header write in `src`, in source order: { kind: "inline" | "writer", index, columns, text }.
 * `index` is the character offset of the write (for "X must happen before the bill write" guards).
 */
export function billHeaderWrites(src) {
  const writes = [];
  const inline = /INSERT\s+INTO\s+accounting\.bills\s*\(/g;
  let m;
  while ((m = inline.exec(src))) {
    const open = m.index + m[0].length - 1;
    const end = matchBracket(src, open);
    const text = src.slice(open + 1, end - 1);
    if (text.includes("${")) continue; // the writer's own dynamic column list
    const columns = stripComments(text).split(",").map((c) => c.trim()).filter(Boolean);
    writes.push({ kind: "inline", index: m.index, columns, text });
  }
  const call = /insertBillHeaderOnClient\s*(?:<[^>]*>)?\s*\(/g;
  while ((m = call.exec(src))) {
    if (/function\s+$/.test(src.slice(Math.max(0, m.index - 30), m.index))) continue; // the definition
    const open = m.index + m[0].length - 1;
    const end = matchBracket(src, open);
    const args = src.slice(open + 1, end - 1);
    const arr = args.indexOf("[");
    if (arr < 0) continue;
    const arrEnd = matchBracket(args, arr);
    const body = stripComments(args.slice(arr, arrEnd));
    const columns = [...body.matchAll(/\[\s*"([a-z_][a-z0-9_]*)"\s*,\s*\{/g)].map((x) => x[1]);
    writes.push({ kind: "writer", index: m.index, columns, text: args });
  }
  return writes.sort((a, b) => a.index - b.index);
}

/** The writes that sit inside the named function's body (by `function <name>(` or `const <name> =`). */
export function billHeaderWritesInFunction(src, fnName) {
  const start = src.search(new RegExp(`(?:function\\s+${fnName}\\s*\\(|const\\s+${fnName}\\s*=)`));
  if (start < 0) return [];
  const brace = src.indexOf("{", src.indexOf(")", start));
  const end = matchBracket(src, brace);
  return billHeaderWrites(src.slice(brace, end));
}
