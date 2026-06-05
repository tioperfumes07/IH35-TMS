#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
runNpmScripts(["verify:customers-vendors-have-list-view"], "verify-audit-fix-3-list-view-toggle-renders");
