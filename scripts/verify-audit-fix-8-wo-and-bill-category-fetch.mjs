#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
runNpmScripts(["verify:wo-category-actually-fetches"], "verify-audit-fix-8-wo-and-bill-category-fetch");
