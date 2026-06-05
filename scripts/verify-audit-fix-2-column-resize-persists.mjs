#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
runNpmScripts(["verify:tables-use-resizable-th"], "verify-audit-fix-2-column-resize-persists");
