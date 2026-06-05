#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
runNpmScripts(["verify:status-bar-height-at-mobile"], "verify-audit-fix-10-mobile-status-bar-collapsed");
