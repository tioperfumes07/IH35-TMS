#!/usr/bin/env node
// DRIVER-EDIT-SAVE-RELOAD-CACHE-KEY — regression guard for LV-DRIVER-EDIT-SAVE-DISPLAY-STALE (#7512).
// MATRIX-BUILT-OPTIONAL: guards an already-built live path; awards no new scoreboard credit.
import fs from "node:fs";

const LABEL = "verify-driver-edit-save-reload-cache-key";
const FILE = "apps/frontend/src/pages/DriverDetail.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const queryKey = '["driver", id, companyId]';
  const mutationStart = text.indexOf("const updateMutation = useMutation({");
  const mutationEnd = text.indexOf("const addQualificationMutation", mutationStart);
  const mutation = mutationStart >= 0 && mutationEnd > mutationStart ? text.slice(mutationStart, mutationEnd) : "";

  if (!text.includes(`queryKey: ${queryKey}`)) failures.push("detail read must use the company-scoped driver cache key");
  if (!mutation.includes("updateDriver(id")) failures.push("Save must PATCH the canonical driver writer");
  if (!mutation.includes(`queryClient.setQueryData(${queryKey}, updated)`)) failures.push("Save success must hydrate the exact detail cache key");
  if (!mutation.includes('queryClient.invalidateQueries({ queryKey: ["drivers"] })')) failures.push("Save success must invalidate the driver roster read");
  if (!mutation.includes("setForm({})") || !mutation.includes("setEditMode(false)")) failures.push("Save success must clear the overlay and return to persisted detail mode");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["detail company scope", source.replace('queryKey: ["driver", id, companyId]', 'queryKey: ["driver", id]')],
    [
      "writer",
      source.replace(
        'const updateMutation = useMutation({\n    mutationFn: () =>\n      updateDriver(id, {',
        'const updateMutation = useMutation({\n    mutationFn: () =>\n      createDriver({'
      ),
    ],
    ["exact cache key", source.replaceAll('queryClient.setQueryData(["driver", id, companyId], updated)', 'queryClient.setQueryData(["driver", id], updated)')],
    ["roster refresh", source.replace('queryClient.invalidateQueries({ queryKey: ["drivers"] })', "void 0")],
    ["persisted detail mode", source.replace("setEditMode(false);", "setEditMode(true);")],
  ];
  for (const [name, mutated] of mutations) {
    if (!audit(mutated).length) throw new Error(`${LABEL} SELFTEST FAIL — ${name}`);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Save writes the canonical driver and refreshes the exact company-scoped detail + roster reads`);
