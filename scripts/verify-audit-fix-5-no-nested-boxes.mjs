#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
runNpmScripts(["verify:no-nested-box-pattern"], "verify-audit-fix-5-no-nested-boxes");
