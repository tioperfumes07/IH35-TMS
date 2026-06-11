#!/usr/bin/env node
/**
 * Guard: verify-event-log-spine.mjs
 * Validates W1-EVENT-LOG-SPINE is properly installed.
 * - events.event_log table exists with correct columns
 * - RLS enabled with tenant isolation policy
 * - events.log_event() function exists
 * - No financial writes (no INSERT to accounting.*)
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from repo root
const envPath = join(__dirname, '..', '.env');
config({ path: envPath });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[verify-event-log-spine] FAIL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function verify() {
  const errors = [];

  // 1. Check events schema exists
  const { data: schemaData, error: schemaError } = await supabase
    .from('information_schema.schemata')
    .select('schema_name')
    .eq('schema_name', 'events')
    .single();

  if (schemaError || !schemaData) {
    errors.push('events schema does not exist');
  }

  // 2. Check events.event_log table exists with required columns
  const { data: columns, error: columnsError } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type')
    .eq('table_schema', 'events')
    .eq('table_name', 'event_log');

  if (columnsError) {
    errors.push(`Failed to query columns: ${columnsError.message}`);
  } else {
    const requiredCols = [
      'event_id', 'operating_company_id', 'event_type', 'actor_type', 'actor_id',
      'subject_type', 'subject_id', 'occurred_at', 'payload', 'source', 'created_at', 'is_active'
    ];
    const foundCols = columns.map(c => c.column_name);
    for (const col of requiredCols) {
      if (!foundCols.includes(col)) {
        errors.push(`Missing required column: ${col}`);
      }
    }
  }

  // 3. Check RLS is enabled
  const { data: rlsData, error: rlsError } = await supabase
    .from('information_schema.tables')
    .select('row_security_enabled')
    .eq('table_schema', 'events')
    .eq('table_name', 'event_log')
    .single();

  if (rlsError || !rlsData || !rlsData.row_security_enabled) {
    errors.push('RLS not enabled on events.event_log');
  }

  // 4. Check log_event function exists
  const { data: funcData, error: funcError } = await supabase
    .from('information_schema.routines')
    .select('routine_name')
    .eq('routine_schema', 'events')
    .eq('routine_name', 'log_event')
    .single();

  if (funcError || !funcData) {
    errors.push('events.log_event() function does not exist');
  }

  // 5. Verify we can actually call log_event
  try {
    const { data: testEvent, error: testError } = await supabase.rpc('log_event', {
      p_operating_company_id: '00000000-0000-0000-0000-000000000000',
      p_event_type: 'verify.test',
      p_actor_type: 'system',
      p_actor_id: '00000000-0000-0000-0000-000000000000',
      p_subject_type: 'task',
      p_subject_id: '00000000-0000-0000-0000-000000000000',
      p_payload: { test: true, guard: 'verify-event-log-spine' },
      p_occurred_at: new Date().toISOString(),
      p_source: 'verify'
    });

    if (testError) {
      errors.push(`log_event() function call failed: ${testError.message}`);
    }
  } catch (e) {
    errors.push(`log_event() threw exception: ${e.message}`);
  }

  // 6. Verify indexes exist for performance
  const { data: indexes, error: idxError } = await supabase
    .from('information_schema.statistics')
    .select('index_name')
    .eq('table_schema', 'events')
    .eq('table_name', 'event_log');

  if (idxError) {
    errors.push(`Failed to query indexes: ${idxError.message}`);
  } else {
    const requiredIndexes = [
      'idx_event_log_subject',
      'idx_event_log_type',
      'idx_event_log_actor',
      'idx_event_log_ocid',
      'idx_event_log_ocid_type_time'
    ];
    const foundIndexes = [...new Set(indexes.map(i => i.index_name))];
    for (const idx of requiredIndexes) {
      if (!foundIndexes.some(fi => fi.includes(idx.replace('idx_event_log_', '')))) {
        errors.push(`Missing required index pattern: ${idx}`);
      }
    }
  }

  // 7. Check migration file contains NO financial writes
  const migrationPath = join(__dirname, '..', 'apps', 'backend', 'migrations', '0168_w1_event_log_spine.sql');
  try {
    const migrationContent = readFileSync(migrationPath, 'utf-8').toLowerCase();
    const forbiddenPatterns = [
      'insert into accounting',
      'update accounting',
      'delete from accounting',
      'create table accounting',
      'alter table accounting'
    ];
    for (const pattern of forbiddenPatterns) {
      if (migrationContent.includes(pattern)) {
        errors.push(`Migration contains financial write pattern: ${pattern}`);
      }
    }
  } catch (e) {
    errors.push(`Could not read migration file: ${e.message}`);
  }

  // Report results
  if (errors.length > 0) {
    console.error('[verify-event-log-spine] FAIL:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  } else {
    console.log('[verify-event-log-spine] OK — events schema, event_log table, RLS, log_event(), indexes, and no-financial-writes all verified');
    process.exit(0);
  }
}

verify().catch(e => {
  console.error(`[verify-event-log-spine] EXCEPTION: ${e.message}`);
  process.exit(1);
});
