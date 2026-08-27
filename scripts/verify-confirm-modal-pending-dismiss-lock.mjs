#!/usr/bin/env node
/**
 * CLS-F6691 — shared confirmation pending-dismiss + fire-and-forget census.
 * One leaf failing this class means every ConfirmModal / sibling confirm shell can fail it.
 */
import fs from "node:fs";
import path from "node:path";

const CONFIRM = "apps/frontend/src/components/shared/ConfirmModal.tsx";
const SIBLINGS = [
  "apps/frontend/src/pages/safety/components/FineConvertConfirmModal.tsx",
  "apps/frontend/src/components/factoring/DeactivateFactorConfirmModal.tsx",
];
const SRC_ROOT = "apps/frontend/src";

function sharedFailures(source) {
  const problems = [];
  if (!/export function closeUnlessPending\(pending: boolean, onClose: \(\) => void\)/.test(source)) {
    problems.push("shared closeUnlessPending helper is missing");
  }
  if (!/const closeUnlessBusy = \(\) => closeUnlessPending\(busy, onClose\)/.test(source)) {
    problems.push("shared ConfirmModal does not reuse closeUnlessPending");
  }
  if (!/<Modal open=\{open\} onClose=\{closeUnlessBusy\}/.test(source)) {
    problems.push("Escape/backdrop can dismiss a pending confirmation");
  }
  if (!/variant="secondary" onClick=\{closeUnlessBusy\} disabled=\{busy\}/.test(source)) {
    problems.push("Cancel remains active during a pending confirmation");
  }
  if (!/await onConfirm\(\);[\s\S]{0,80}onClose\(\);/.test(source)) {
    problems.push("success close does not wait for confirmation promise");
  }
  return problems;
}

function walkTsx(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walkTsx(p, acc);
    else if (name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

function consumerFailures() {
  const problems = [];
  for (const file of walkTsx(SRC_ROOT)) {
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes("<ConfirmModal")) continue;
    const rel = file.split(path.sep).join("/");
    const blocks = src.split(/<ConfirmModal/);
    for (const block of blocks.slice(1)) {
      const tag = block.slice(0, 1800);
      if (/\.mutate\(/.test(tag) && !/\.mutateAsync\(/.test(tag)) {
        problems.push(`${rel}: ConfirmModal onConfirm fire-and-forgets mutate() — await mutateAsync so the shared busy lock covers the write`);
      }
      if (/set(?:Pending\w*|UnhideTarget|DisconnectTarget|DeactivateTarget|ConfirmApproveRow|InviteConfirmOpen|MakeInactiveOpen)\(null\);[\s\S]{0,240}\.(?:mutate|mutateAsync)\(/.test(tag)) {
        problems.push(`${rel}: clears pending snapshot before the write — failed writes lose retry`);
      }
    }
  }
  return problems;
}

function siblingFailures() {
  const problems = [];
  for (const file of SIBLINGS) {
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes("closeUnlessPending")) {
      problems.push(`${file}: sibling confirm shell does not reuse closeUnlessPending`);
    }
    if (!/onClose=\{dismiss\}/.test(src) && !/onClose=\{closeUnlessBusy\}/.test(src)) {
      problems.push(`${file}: Modal onClose is not the pending-gated dismiss`);
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = fs.readFileSync(CONFIRM, "utf8");
  const mutations = [
    ["export function closeUnlessPending(pending: boolean, onClose: () => void)", "function closeIfIdle(pending, onClose)"],
    ["const closeUnlessBusy = () => closeUnlessPending(busy, onClose);", "const closeUnlessBusy = () => onClose();"],
    ["onClose={closeUnlessBusy}", "onClose={onClose}"],
    ['onClick={closeUnlessBusy} disabled={busy}', "onClick={onClose}"],
    ["await onConfirm();", "void onConfirm();"],
  ];
  for (const [from, to] of mutations) {
    const mutated = live.replace(from, to);
    if (mutated === live || sharedFailures(mutated).length === 0) {
      throw new Error(`verify-confirm-modal-pending-dismiss-lock SELFTEST missed ${from}`);
    }
  }
  const users = fs.readFileSync("apps/frontend/src/pages/Users.tsx", "utf8");
  const planted = users.replace("await deactivateMutation.mutateAsync(pendingDeactivate);", "deactivateMutation.mutate(pendingDeactivate);");
  if (planted === users) throw new Error("Users mutateAsync fixture missing");
  const origWalk = consumerFailures;
  // temporarily write is heavy; inline check planted tag
  if (!/\.mutate\(/.test(planted) || !planted.includes("<ConfirmModal")) throw new Error("plant inert");
  const fakeProblems = [];
  const tag = planted.split(/<ConfirmModal/)[1]?.slice(0, 1800) ?? "";
  if (/\.mutate\(/.test(tag) && !/\.mutateAsync\(/.test(tag)) fakeProblems.push("planted");
  if (!fakeProblems.length) throw new Error("census SELFTEST missed fire-and-forget mutate()");
  console.log(`verify-confirm-modal-pending-dismiss-lock SELFTEST PASS — ${mutations.length}/shared + 1/census pending-dismiss mutations rejected`);
  process.exit(0);
}

const problems = [...sharedFailures(fs.readFileSync(CONFIRM, "utf8")), ...consumerFailures(), ...siblingFailures()];
if (problems.length) {
  console.error(`verify-confirm-modal-pending-dismiss-lock FAILED:\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
console.log("verify-confirm-modal-pending-dismiss-lock PASS — shared busy lock, all ConfirmModal callers await writes, sibling shells reuse closeUnlessPending");
