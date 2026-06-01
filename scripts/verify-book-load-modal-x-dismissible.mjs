#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const modalPath = resolve(process.cwd(), "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx");
const source = readFileSync(modalPath, "utf8");

const hasXCloseHandler = /onClick=\{handleBookLoadHeaderClose\}/.test(source);
const hasHandlerBody = /const handleBookLoadHeaderClose[\s\S]*attemptBookLoadClose\(\)/.test(source);

if (!hasXCloseHandler || !hasHandlerBody) {
  console.error("FAIL: Book load modal X button is not wired to dismiss handler.");
  process.exit(1);
}

console.log("PASS: Book load modal X button dismiss handler is wired.");
