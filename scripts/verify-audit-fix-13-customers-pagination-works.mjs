#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
runNpmScripts(["verify:list-cards-are-anchors", "verify:header-counts-match-actual"], "verify-audit-fix-13-customers-pagination-works");
