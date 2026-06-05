#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
runNpmScripts(["verify:accounting-subpages-have-subnav"], "verify-audit-fix-12-bills-has-subnav-and-create");
