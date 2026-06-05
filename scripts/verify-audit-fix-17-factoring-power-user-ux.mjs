#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
runNpmScripts(["verify:factoring-destructive-actions-have-confirm"], "verify-audit-fix-17-factoring-power-user-ux");
