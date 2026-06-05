#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
runNpmScripts(["verify:no-horizontal-overflow-at-1024"], "verify-audit-fix-4-no-overflow-1024");
