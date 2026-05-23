#!/usr/bin/env node
import fs from "node:fs";

const servicePath = "apps/backend/src/telematics/arrival-detection.service.ts";
if (!fs.existsSync(servicePath)) {
  throw new Error(`Missing arrival detection service: ${servicePath}`);
}
const content = fs.readFileSync(servicePath, "utf8");

if (!content.includes("export const ARRIVAL_RADIUS_FEET = 250;")) {
  throw new Error("arrival radius constant must be ARRIVAL_RADIUS_FEET = 250");
}

if (!content.includes("distanceFeet > ARRIVAL_RADIUS_FEET")) {
  throw new Error("arrival trigger must compare distance against ARRIVAL_RADIUS_FEET");
}

const forbiddenLiterals = /\b(distance|radius)\w*[^;\n]*\b(2[0-4][0-9]|25[1-9]|[3-9][0-9]{2,})\b/gi;
const matches = content.match(forbiddenLiterals) ?? [];
if (matches.length > 0) {
  throw new Error(`unexpected hardcoded radius-like literals found: ${matches.join(" | ")}`);
}

console.log("verify-arrival-haversine-uses-locked-radius: ok");
