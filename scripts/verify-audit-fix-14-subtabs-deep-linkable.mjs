#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
runNpmScripts(["verify:subtabs-are-real-routes"], "verify-audit-fix-14-subtabs-deep-linkable");
