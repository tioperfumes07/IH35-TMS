#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
runNpmScripts(["verify:no-silent-redirects"], "verify-audit-fix-6-routes-do-not-redirect");
