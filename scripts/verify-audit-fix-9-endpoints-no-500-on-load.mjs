#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
runNpmScripts(["verify:no-flaky-endpoints-on-page-load"], "verify-audit-fix-9-endpoints-no-500-on-load");
