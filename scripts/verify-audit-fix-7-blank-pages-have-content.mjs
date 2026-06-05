#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
runNpmScripts(["verify:routes-not-blank"], "verify-audit-fix-7-blank-pages-have-content");
