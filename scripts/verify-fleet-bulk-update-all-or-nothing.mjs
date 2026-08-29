#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  factory: "apps/backend/src/bulk/bulk-update.factory.ts",
  units: "apps/backend/src/mdata/unit-bulk-update.routes.ts",
  equipment: "apps/backend/src/mdata/equipment-bulk-update.routes.ts",
};

const readSources = () =>
  Object.fromEntries(
    Object.entries(FILES).map(([key, file]) => [
      key,
      fs.readFileSync(path.join(ROOT, file), "utf8"),
    ]),
  );

function verify(sources) {
  const failures = [];
  const require = (ok, message) => {
    if (!ok) failures.push(message);
  };

  require(sources.factory.includes(
    "class FleetBulkTargetMismatchError",
  ), "shared target mismatch error missing");
  require(sources.factory.includes(
    "matchedCount !== requestedCount",
  ), "shared exact-count comparison missing");
  require(sources.factory.includes(
    "reply.code(409)",
  ), "shared HTTP 409 response missing");

  for (const [key, idField] of [
    ["units", "unit_ids"],
    ["equipment", "equipment_ids"],
  ]) {
    const source = sources[key];
    require(source.includes(
      `${idField} must be unique`,
    ), `${key}: duplicate-ID validation missing`);
    require(new RegExp(
      `assertExactFleetBulkTargetCount\\(\\s*${idField}\\.length,\\s*oldRes\\.rows\\.length,\\s*"pre_update"`,
    ).test(source), `${key}: pre-update exact target assertion missing`);
    require(new RegExp(
      `assertExactFleetBulkTargetCount\\(\\s*${idField}\\.length,\\s*updateRes\\.rows\\.length,\\s*"post_update"`,
    ).test(source), `${key}: post-update exact target assertion missing`);
    require(source.includes(
      "error instanceof FleetBulkTargetMismatchError",
    ), `${key}: typed mismatch catch missing`);
    require(source.includes(
      "sendFleetBulkTargetMismatch(reply, error)",
    ), `${key}: mismatch response missing`);
  }

  return failures;
}

const sources = readSources();
const failures = verify(sources);
if (failures.length) {
  console.error(
    `[verify-fleet-bulk-update-all-or-nothing] FAIL\n- ${failures.join("\n- ")}`,
  );
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [
      "factory exact comparison",
      "factory",
      "matchedCount !== requestedCount",
      "false",
    ],
    ["factory 409", "factory", "reply.code(409)", "reply.code(200)"],
    [
      "unit duplicate validation",
      "units",
      "unit_ids must be unique",
      "unit ids accepted",
    ],
    ["unit pre-update assertion", "units", '"pre_update"', '"removed_pre"'],
    ["unit post-update assertion", "units", '"post_update"', '"removed_post"'],
    [
      "unit mismatch response",
      "units",
      "sendFleetBulkTargetMismatch(reply, error)",
      "reply.send(error)",
    ],
    [
      "equipment duplicate validation",
      "equipment",
      "equipment_ids must be unique",
      "equipment ids accepted",
    ],
    [
      "equipment pre-update assertion",
      "equipment",
      '"pre_update"',
      '"removed_pre"',
    ],
    [
      "equipment post-update assertion",
      "equipment",
      '"post_update"',
      '"removed_post"',
    ],
    [
      "equipment mismatch response",
      "equipment",
      "sendFleetBulkTargetMismatch(reply, error)",
      "reply.send(error)",
    ],
  ];

  for (const [label, key, needle, replacement] of mutations) {
    const mutated = {
      ...sources,
      [key]: sources[key].replace(needle, replacement),
    };
    if (verify(mutated).length === 0) {
      console.error(
        `[verify-fleet-bulk-update-all-or-nothing] SELFTEST FAIL: ${label} mutation survived`,
      );
      process.exit(1);
    }
  }
  console.log(
    `[verify-fleet-bulk-update-all-or-nothing] SELFTEST PASS (${mutations.length}/${mutations.length})`,
  );
}

console.log(
  "[verify-fleet-bulk-update-all-or-nothing] PASS (unit + equipment exact scoped targets)",
);
