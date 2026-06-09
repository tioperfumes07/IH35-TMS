import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseRegexLiteral,
  valueFromRegex,
  buildDisplayId,
  scalarFallbackForType,
} from "../db-verify-rls-cross-tenant-gate.mjs";

test("parseRegexLiteral extracts pattern from CHECK constraint", () => {
  const checkDef = "CHECK (display_id ~ '^P-[0-9]{4}-[0-9]{4}$')";
  const result = parseRegexLiteral(checkDef, "display_id");
  assert.equal(result, "^P-[0-9]{4}-[0-9]{4}$");
});

test("parseRegexLiteral returns null when column not referenced", () => {
  const checkDef = "CHECK (other_col ~ '^P-[0-9]+$')";
  const result = parseRegexLiteral(checkDef, "display_id");
  assert.equal(result, null);
});

test("valueFromRegex generates valid string from pattern", () => {
  const result = valueFromRegex("^P-[0-9]{4}-[0-9]{4}$", "payment_applications", 1);
  assert.ok(result.startsWith("P-"));
  assert.ok(result.length === 11); // P-XXXX-XXXX
});

test("valueFromRegex handles two-segment display_id patterns", () => {
  const result = valueFromRegex("^CM-[0-9]{4}-[0-9]{4}$", "credit_memos", 1);
  assert.ok(result.startsWith("CM-"));
  assert.ok(result.length === 12); // CM-XXXX-XXXX
});

test("buildDisplayId generates unique IDs with marker", () => {
  const result1 = buildDisplayId("payment_applications", 1, "P", 6);
  const result2 = buildDisplayId("payment_applications", 2, "P", 6);
  assert.ok(result1.startsWith("P-RLS1-"));
  assert.ok(result2.startsWith("P-RLS2-"));
  assert.notEqual(result1, result2);
});

test("scalarFallbackForType handles common PostgreSQL types", () => {
  assert.equal(scalarFallbackForType("text", "name", 1), "RLS-name-1");
  assert.equal(scalarFallbackForType("varchar", "title", 2), "RLS-title-2");
  assert.equal(scalarFallbackForType("uuid", "id", 1), "00000000-0000-0000-0000-000000000001");
  assert.equal(typeof scalarFallbackForType("int4", "count", 1), "number");
  assert.equal(typeof scalarFallbackForType("int8", "total", 1), "number");
  assert.equal(typeof scalarFallbackForType("bool", "active", 1), "boolean");
  assert.ok(scalarFallbackForType("timestamp", "created_at", 1) instanceof Date);
  assert.ok(scalarFallbackForType("timestamptz", "updated_at", 1) instanceof Date);
  assert.equal(typeof scalarFallbackForType("numeric", "amount", 1), "number");
  assert.equal(typeof scalarFallbackForType("money", "price", 1), "number");
});
