#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const HOOK = "apps/frontend/src/hooks/useTeamSplits.ts";
const PAGE = "apps/frontend/src/pages/drivers/TeamSplitConfig.tsx";

function inspect(hook, page) {
  const errors = [];
  const scopedWriters = hook.match(/withCompanyQuery\([\s\S]{0,120}input\.companyId\)/g)?.length ?? 0;
  if (scopedWriters !== 2 || /withCompanyQuery\([\s\S]{0,120}operatingCompanyId!\)/.test(hook)) errors.push("writers still close over mutable company");
  const scopedInvalidations = hook.match(/queryKey: \["team-split-configs", input\.companyId\]/g)?.length ?? 0;
  if (scopedInvalidations !== 2) errors.push("create/end cache refresh must use submitted company");
  const generationGuards = page.match(/input\.generation !== createGenerationRef\.current/g)?.length ?? 0;
  if (!page.includes("createGenerationRef") || generationGuards !== 2) errors.push("create callbacks are not generation guarded");
  const companyGuards = page.match(/input\.companyId !== operatingCompanyId/g)?.length ?? 0;
  if (companyGuards !== 2) errors.push("create callbacks are not company guarded");
  if (!page.includes("endConfig.mutateAsync({ companyId, id })") || !page.includes('data-testid="team-split-end-error"')) errors.push("end failure remains silent or unscoped");
  if (!page.includes("confirmDiscardOnClose") || !page.includes("isDirty={Boolean(primaryDriverId")) errors.push("populated create draft can be discarded silently");
  if (!page.includes("onClose={closeCreate}") || !page.includes("onClick={closeCreate}")) errors.push("drawer dismiss paths do not share lifecycle boundary");
  return errors;
}

const hook = fs.readFileSync(HOOK, "utf8");
const page = fs.readFileSync(PAGE, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    [hook.replaceAll("input.companyId", "operatingCompanyId!"), page],
    [hook, page.replace("input.generation !== createGenerationRef.current", "false")],
    [hook, page.replace('data-testid="team-split-end-error"', 'data-testid="removed"')],
    [hook, page.replace("confirmDiscardOnClose", "")],
    [hook, page.replace("onClick={closeCreate}", "onClick={() => setCreateOpen(false)}")],
  ];
  const missed = mutations.filter(([h, p]) => inspect(h, p).length === 0);
  if (missed.length) {
    console.error(`verify-team-split-action-lifecycle SELFTEST FAIL — ${missed.length}/5 mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-team-split-action-lifecycle selftest PASS — 5/5 stale/silent/discard regressions rejected");
  process.exit(0);
}
const errors = inspect(hook, page);
if (errors.length) {
  console.error("verify-team-split-action-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-team-split-action-lifecycle PASS — create/end are submitted-company scoped, visible and discard-safe");
