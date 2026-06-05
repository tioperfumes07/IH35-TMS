#!/usr/bin/env node
import { runNpmScripts } from "./pass-7/_delegate.mjs";
runNpmScripts(["verify:invoice-create-does-not-leave-accounting"], "verify-audit-fix-16-invoice-create-stays-in-accounting");
