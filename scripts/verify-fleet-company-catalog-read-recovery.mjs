#!/usr/bin/env node
import fs from "node:fs";

const files = [
  "apps/frontend/src/components/fleet/CreateUnitModal.tsx",
  "apps/frontend/src/components/fleet/CreateTrailerModal.tsx",
  "apps/frontend/src/components/fleet/EditVehicleModal.tsx",
  "apps/frontend/src/components/fleet/EditTrailerModal.tsx",
];

function verify(sources) {
  const failures = [];
  for (const [file, source] of Object.entries(sources)) {
    if (!/companiesQuery\.isError \? \[\] : companiesQuery\.data \?\? \[\]/.test(source)) {
      failures.push(`${file}: retained company options are not suppressed on read failure`);
    }
    if (!/\[companiesQuery\.data, companiesQuery\.isError\]/.test(source)) {
      failures.push(`${file}: company options do not recompute when read status changes`);
    }
    const companyPickerCount = (source.match(/disabled=\{companiesQuery\.isError\}/g) ?? []).length;
    const requiredPickerCount = file.endsWith("CreateUnitModal.tsx") ? 2 : 1;
    if (companyPickerCount < requiredPickerCount) {
      failures.push(`${file}: ${requiredPickerCount} company picker(s) must fail closed`);
    }
    if (!/Couldn't load company choices/.test(source) || !/companiesQuery\.refetch\(\)/.test(source)) {
      failures.push(`${file}: exact company-catalog Retry is missing`);
    }
  }
  return failures;
}

const sources = Object.fromEntries(files.map((file) => [file, fs.readFileSync(file, "utf8")]));
const failures = verify(sources);
if (failures.length) {
  console.error(`fleet company catalog read recovery guard failed (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [];
  for (const file of files) {
    mutations.push({
      ...sources,
      [file]: sources[file].replace("companiesQuery.isError ? [] :", "false ? [] :"),
    });
    mutations.push({
      ...sources,
      [file]: sources[file].replace("disabled={companiesQuery.isError}", "disabled={false}"),
    });
  }
  mutations.forEach((mutation, index) => {
    if (verify(mutation).length === 0) {
      console.error(`fleet company catalog guard selftest mutation ${index + 1} escaped`);
      process.exit(1);
    }
  });
  console.log(`fleet company catalog read recovery guard selftest PASS (${mutations.length}/8)`);
}

console.log("fleet company catalog read recovery guard PASS");
