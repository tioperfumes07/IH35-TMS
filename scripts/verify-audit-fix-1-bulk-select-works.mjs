#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
runNpmScripts(["verify:all-list-pages-have-bulk-select"], "verify-audit-fix-1-bulk-select-works");
