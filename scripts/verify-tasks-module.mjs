#!/usr/bin/env node
/**
 * Guard: verify-tasks-module.mjs
 * Validates W1B-TASKS-MODULE is properly installed.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = join(__dirname, '..', '.env');
config({ path: envPath });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[verify-tasks-module] FAIL: Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function verify() {
  const errors = [];

  // 1. tasks schema exists
  const { data: schemaData, error: schemaError } = await supabase
    .from('information_schema.schemata')
    .select('schema_name')
    .eq('schema_name', 'tasks')
    .single();
  if (schemaError || !schemaData) errors.push('tasks schema missing');

  // 2. tasks.task table with required columns
  const { data: columns, error: colError } = await supabase
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_schema', 'tasks')
    .eq('table_name', 'task');
  if (colError) {
    errors.push(`column query failed: ${colError.message}`);
  } else {
    const required = ['task_id', 'operating_company_id', 'category', 'status', 'assigned_to_user_id', 'scheduled_date', 'title'];
    const found = columns.map(c => c.column_name);
    for (const col of required) {
      if (!found.includes(col)) errors.push(`missing column: ${col}`);
    }
  }

  // 3. RLS enabled
  const { data: rls, error: rlsError } = await supabase
    .from('information_schema.tables')
    .select('row_security_enabled')
    .eq('table_schema', 'tasks')
    .eq('table_name', 'task')
    .single();
  if (rlsError || !rls || !rls.row_security_enabled) errors.push('RLS not enabled on tasks.task');

  // 4. Indexes for planner performance
  const { data: idx, error: idxError } = await supabase
    .from('information_schema.statistics')
    .select('index_name')
    .eq('table_schema', 'tasks')
    .eq('table_name', 'task');
  if (idxError) {
    errors.push(`index query failed: ${idxError.message}`);
  } else {
    const foundIdx = [...new Set(idx.map(i => i.index_name))];
    const requiredPatterns = ['idx_task_employee_date', 'idx_task_category', 'idx_task_subject'];
    for (const pat of requiredPatterns) {
      if (!foundIdx.some(fi => fi.includes(pat.replace('idx_task_', '')))) {
        errors.push(`missing index pattern: ${pat}`);
      }
    }
  }

  // 5. Triggers for spine logging exist
  const { data: triggers, error: trigError } = await supabase
    .from('information_schema.triggers')
    .select('trigger_name')
    .eq('event_object_schema', 'tasks')
    .eq('event_object_table', 'task');
  if (trigError) {
    errors.push(`trigger query failed: ${trigError.message}`);
  } else {
    const foundTrig = triggers.map(t => t.trigger_name);
    if (!foundTrig.includes('tr_task_status_change')) errors.push('missing trigger: tr_task_status_change');
    if (!foundTrig.includes('tr_task_created')) errors.push('missing trigger: tr_task_created');
  }

  // 6. No financial writes in migration
  const migrationPath = join(__dirname, '..', 'apps', 'backend', 'migrations', '0169_w1b_tasks_module.sql');
  try {
    const content = readFileSync(migrationPath, 'utf-8').toLowerCase();
    const forbidden = ['insert into accounting', 'update accounting', 'delete from accounting', 'create table accounting'];
    for (const pat of forbidden) {
      if (content.includes(pat)) errors.push(`financial write pattern: ${pat}`);
    }
  } catch (e) {
    errors.push(`cannot read migration: ${e.message}`);
  }

  // Report
  if (errors.length > 0) {
    console.error('[verify-tasks-module] FAIL:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  } else {
    console.log('[verify-tasks-module] OK — schema, tables, RLS, indexes, triggers, no-financial-writes verified');
    process.exit(0);
  }
}

verify().catch(e => {
  console.error(`[verify-tasks-module] EXCEPTION: ${e.message}`);
  process.exit(1);
});
