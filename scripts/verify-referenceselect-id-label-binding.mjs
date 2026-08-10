#!/usr/bin/env node
import fs from "node:fs";

const referenceSelect = fs.readFileSync("apps/frontend/src/components/parity/ReferenceSelect.tsx", "utf8");
const combobox = fs.readFileSync("apps/frontend/src/components/Combobox.tsx", "utf8");
const expense = fs.readFileSync("apps/frontend/src/components/expenses/RecordExpenseForm.tsx", "utf8");
const task = fs.readFileSync("apps/frontend/src/components/tasks/CreateTaskModal.tsx", "utf8");

for (const token of ["id?: string", "id,", "id={id}"]) {
  if (!referenceSelect.includes(token)) throw new Error(`ReferenceSelect id chain missing ${token}`);
}
if (!combobox.includes("id={id}")) throw new Error("Combobox must render the forwarded id on its input");

for (const suffix of ["vendor", "category", "payment-account"]) {
  if (!expense.includes(`htmlFor={fieldId(\"${suffix}\")}`) || !expense.includes(`id={fieldId(\"${suffix}\")}`)) {
    throw new Error(`RecordExpenseForm label binding missing for ${suffix}`);
  }
}
if (!task.includes('htmlFor="create-task-entity-id"') || !task.includes('id="create-task-entity-id"')) {
  throw new Error("CreateTaskModal customer ReferenceSelect label binding missing");
}

console.log("verify-referenceselect-id-label-binding: PASS");
