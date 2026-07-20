// Guard (d-02): unsaved/loading load side panel must not show a disabled red Cancel Load — plain Close instead.
import { readFileSync } from "node:fs";

const fail = (m) => {
  console.error(`FAIL verify-cancel-load-draft-close: ${m}`);
  process.exit(1);
};

const drawer = readFileSync("apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx", "utf8");

if (!/canCancelPersistedLoad\s*=\s*Boolean\(load && load\.status !== "cancelled"\)/.test(drawer)) {
  fail("LoadDetailDrawer must derive canCancelPersistedLoad from persisted load + non-cancelled status");
}

if (!/canCancelPersistedLoad \? \([\s\S]*variant="danger"[\s\S]*Cancel Load[\s\S]*\) : \([\s\S]*variant="secondary"[\s\S]*Close/.test(drawer)) {
  fail("footer must render danger Cancel Load when canCancelPersistedLoad, else secondary Close");
}

if (/disabled=\{!load \|\| load\.status === "cancelled"\}[\s\S]*Cancel Load/.test(drawer)) {
  fail("footer must not keep a disabled red Cancel Load for unsaved/loading loads");
}

console.log("OK verify-cancel-load-draft-close: draft/unsaved footer uses Close, not disabled Cancel Load.");
