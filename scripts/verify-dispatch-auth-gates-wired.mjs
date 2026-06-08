#!/usr/bin/env node
import fs from "node:fs";
const f = [];
const r = (p)=>{const c=fs.existsSync(p)?fs.readFileSync(p,"utf8"):""; if(!c)f.push(`MISSING ${p}`); return c;};
const m=(p,re,l)=>{if(!re.test(r(p)))f.push(`${p}: ${l}`);};
m("apps/backend/src/dispatch/auth-gates/gate-registry.service.ts",/checkGates/,"registry");
m("apps/backend/src/dispatch/auth-gates/wf-044-advisory.gate.ts",/WF-044/,"wf-044");
m("apps/backend/src/dispatch/auth-gates/wf-050-dvir-major.gate.ts",/WF-050/,"wf-050");
m("apps/backend/src/dispatch/auth-gates/wf-038-active-driver.gate.ts",/WF-038/,"wf-038");
m("apps/backend/src/dispatch/auth-gates/routes.ts",/registerDispatchAuthGateRoutes/,"routes");
m("apps/backend/src/dispatch/auth-gates/routes.ts",/checkGates/,"mutation gate hook");
m("apps/backend/src/index.ts",/registerDispatchAuthGateRoutes/,"index");
m("apps/frontend/src/components/dispatch/AuthGatePanel.tsx",/AuthGatePanel/,"panel");
m("apps/frontend/src/pages/dispatch/book-load/BookLoad.tsx",/AuthGatePanel/,"book load");
m("apps/frontend/src/pages/dispatch/assignments/AssignmentEdit.tsx",/AuthGatePanel/,"assignment edit");
r(".block-ready/GAP-47.json");
if(f.length){console.error(f);process.exit(1);} console.log("verify:dispatch-auth-gates — OK");
