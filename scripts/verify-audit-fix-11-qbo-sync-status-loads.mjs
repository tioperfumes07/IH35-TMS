#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
runNpmScripts(["verify:qbo-sync-status-endpoints-return-200"], "verify-audit-fix-11-qbo-sync-status-loads");
