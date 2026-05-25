import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_FILENAME_REGEX = /^(\d{4})_.+\.sql$/i;
const IGNORE_FILE_NAME = "migration-content-verifier-ignore.json";

function stripComments(sql) {
  const withoutBlock = sql.replace(/\/\*[\s\S]*?\*\//g, " ");
  return withoutBlock
    .split("\n")
    .map((line) => line.replace(/--.*$/g, " "))
    .join("\n");
}

function maskLiteralBodies(sql) {
  return sql.replace(/'(?:''|[^'])*'/g, " '' ");
}

function normalizeIdent(raw) {
  return raw.replace(/"/g, "").trim();
}

function parseDefaultSchemas(sqlText) {
  const schemas = [];
  const regex = /set\s+(?:local\s+)?search_path\s+to\s+([^;]+)/gi;
  let match;
  while ((match = regex.exec(sqlText))) {
    const first = match[1]
      .split(",")
      .map((piece) => piece.trim())
      .find(Boolean);
    if (!first) continue;
    const normalized = normalizeIdent(first);
    if (normalized && !schemas.includes(normalized)) {
      schemas.push(normalized);
    }
  }
  return schemas;
}

function parseQualifiedName(schemaPart, objectPart, defaultSchema) {
  const schema = normalizeIdent(schemaPart || defaultSchema || "public");
  const name = normalizeIdent(objectPart || "");
  return { schema, name };
}

function pushUnique(items, key, value) {
  if (!items.some((entry) => entry[key] === value[key])) {
    items.push(value);
  }
}

function parseMigrationObjects(sql) {
  const text = maskLiteralBodies(stripComments(sql));
  const defaultSchemas = parseDefaultSchemas(text);
  const defaultSchema = defaultSchemas[0] || "public";
  const expected = {
    schemas: [],
    tables: [],
    views: [],
    materializedViews: [],
    columns: [],
    indexes: [],
    types: [],
    enumValues: [],
    functions: [],
    triggers: [],
    seedTables: [],
  };

  {
    const regex = /create\s+schema\s+(?:if\s+not\s+exists\s+)?(?:"?([a-zA-Z_][\w$]*)"?)/gi;
    let match;
    while ((match = regex.exec(text))) {
      const schema = normalizeIdent(match[1]);
      pushUnique(expected.schemas, "schema", { schema });
    }
  }

  {
    const regex =
      /(?:^|[;\n])\s*create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)/gi;
    let match;
    while ((match = regex.exec(text))) {
      const { schema, name } = parseQualifiedName(match[1], match[2], defaultSchema);
      pushUnique(expected.tables, "fqtn", { schema, table: name, fqtn: `${schema}.${name}` });
    }
  }

  {
    const regex = /create\s+(?:or\s+replace\s+)?view\s+(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)/gi;
    let match;
    while ((match = regex.exec(text))) {
      const { schema, name } = parseQualifiedName(match[1], match[2], defaultSchema);
      pushUnique(expected.views, "fqvn", { schema, view: name, fqvn: `${schema}.${name}` });
    }
  }

  {
    const regex = /create\s+materialized\s+view\s+(?:if\s+not\s+exists\s+)?(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)/gi;
    let match;
    while ((match = regex.exec(text))) {
      const { schema, name } = parseQualifiedName(match[1], match[2], defaultSchema);
      pushUnique(expected.materializedViews, "fqmvn", { schema, view: name, fqmvn: `${schema}.${name}` });
    }
  }

  {
    const regex = /alter\s+table\s+(?:if\s+exists\s+)?(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)([\s\S]*?);/gi;
    let match;
    while ((match = regex.exec(text))) {
      const { schema, name } = parseQualifiedName(match[1], match[2], defaultSchema);
      const alterBody = match[3];
      const addColumnRegex = /add\s+column\s+(?:if\s+not\s+exists\s+)?(?:"?([a-zA-Z_][\w$]*)"?)/gi;
      let colMatch;
      while ((colMatch = addColumnRegex.exec(alterBody))) {
        const column = normalizeIdent(colMatch[1]);
        const fqcn = `${schema}.${name}.${column}`;
        pushUnique(expected.columns, "fqcn", { schema, table: name, column, fqcn });
      }
    }
  }

  {
    const regex =
      /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)\s+on\s+(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)/gi;
    let match;
    while ((match = regex.exec(text))) {
      const indexSchema = normalizeIdent(match[1] || match[3] || defaultSchema);
      const indexName = normalizeIdent(match[2]);
      const tableSchema = normalizeIdent(match[3] || defaultSchema);
      const tableName = normalizeIdent(match[4]);
      const fqin = `${indexSchema}.${indexName}`;
      pushUnique(expected.indexes, "fqin", {
        indexSchema,
        indexName,
        tableSchema,
        tableName,
        fqin,
      });
    }
  }

  {
    const regex = /create\s+type\s+(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)/gi;
    let match;
    while ((match = regex.exec(text))) {
      const { schema, name } = parseQualifiedName(match[1], match[2], defaultSchema);
      const fqtn = `${schema}.${name}`;
      pushUnique(expected.types, "fqtn", { schema, type: name, fqtn });
    }
  }

  {
    const createEnumRegex =
      /create\s+type\s+(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)\s+as\s+enum\s*\(([\s\S]*?)\)/gi;
    let match;
    while ((match = createEnumRegex.exec(text))) {
      const { schema, name } = parseQualifiedName(match[1], match[2], defaultSchema);
      const values = match[3]
        .split(",")
        .map((part) => part.trim())
        .map((part) => part.match(/'([^']+)'/))
        .filter(Boolean)
        .map((valueMatch) => valueMatch[1]);
      for (const value of values) {
        const key = `${schema}.${name}.${value}`;
        pushUnique(expected.enumValues, "key", { schema, type: name, value, key });
      }
    }

    const alterEnumRegex =
      /alter\s+type\s+(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)[\s\S]*?add\s+value(?:\s+if\s+not\s+exists)?\s+'([^']+)'/gi;
    while ((match = alterEnumRegex.exec(text))) {
      const { schema, name } = parseQualifiedName(match[1], match[2], defaultSchema);
      const value = match[3];
      const key = `${schema}.${name}.${value}`;
      pushUnique(expected.enumValues, "key", { schema, type: name, value, key });
    }
  }

  {
    const regex = /create\s+(?:or\s+replace\s+)?function\s+(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)\s*\(/gi;
    let match;
    while ((match = regex.exec(text))) {
      const { schema, name } = parseQualifiedName(match[1], match[2], defaultSchema);
      const fqfn = `${schema}.${name}`;
      pushUnique(expected.functions, "fqfn", { schema, functionName: name, fqfn });
    }
  }

  {
    const regex =
      /create\s+trigger\s+(?:"?([a-zA-Z_][\w$]*)"?)\s+[\s\S]*?\son\s+(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)/gi;
    let match;
    while ((match = regex.exec(text))) {
      const triggerName = normalizeIdent(match[1]);
      const tableSchema = normalizeIdent(match[2] || defaultSchema);
      const tableName = normalizeIdent(match[3]);
      const key = `${tableSchema}.${tableName}.${triggerName}`;
      pushUnique(expected.triggers, "key", { tableSchema, tableName, triggerName, key });
    }
  }

  {
    const regex = /insert\s+into\s+(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)/gi;
    let match;
    while ((match = regex.exec(text))) {
      const { schema, name } = parseQualifiedName(match[1], match[2], defaultSchema);
      const fqtt = `${schema}.${name}`;
      pushUnique(expected.seedTables, "fqtt", { schema, table: name, fqtt });
    }
  }

  return expected;
}

function makeObjectKey(kind, objectName) {
  return `${kind}:${objectName}`;
}

export function parseConditionalGuardedTargets(sql) {
  const text = stripComments(sql);
  const defaultSchemas = parseDefaultSchemas(text);
  const defaultSchema = defaultSchemas[0] || "public";
  const guardedTargets = [];
  const guardRegex = /if\s+exists\s*\(([\s\S]*?)\)\s+then([\s\S]*?)end\s+if/gi;
  let match;
  while ((match = guardRegex.exec(text))) {
    const guardExpr = match[1];
    const guardedBody = match[2];

    let dependency = null;
    const procGuardMatch = guardExpr.match(
      /n\.nspname\s*=\s*'([^']+)'\s+and\s+p\.proname\s*=\s*'([^']+)'/i
    );
    if (procGuardMatch) {
      dependency = {
        kind: "function",
        schema: normalizeIdent(procGuardMatch[1]),
        name: normalizeIdent(procGuardMatch[2]),
      };
    }
    const regclassGuardMatch = guardExpr.match(/to_regclass\(\s*'([^']+)'\s*\)\s+is\s+not\s+null/i);
    if (!dependency && regclassGuardMatch) {
      const [schemaRaw, tableRaw] = regclassGuardMatch[1].split(".");
      if (schemaRaw && tableRaw) {
        dependency = {
          kind: "table",
          schema: normalizeIdent(schemaRaw),
          name: normalizeIdent(tableRaw),
        };
      }
    }
    if (!dependency) continue;

    const targets = [];

    {
      const regex =
        /create\s+trigger\s+(?:"?([a-zA-Z_][\w$]*)"?)\s+[\s\S]*?\son\s+(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)/gi;
      let triggerMatch;
      while ((triggerMatch = regex.exec(guardedBody))) {
        const triggerName = normalizeIdent(triggerMatch[1]);
        const tableSchema = normalizeIdent(triggerMatch[2] || defaultSchema);
        const tableName = normalizeIdent(triggerMatch[3]);
        targets.push({
          kind: "trigger",
          objectName: `${tableSchema}.${tableName}.${triggerName}`,
        });
      }
    }

    {
      const regex =
        /create\s+(?:or\s+replace\s+)?function\s+(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)\s*\(/gi;
      let functionMatch;
      while ((functionMatch = regex.exec(guardedBody))) {
        const { schema, name } = parseQualifiedName(functionMatch[1], functionMatch[2], defaultSchema);
        targets.push({
          kind: "function",
          objectName: `${schema}.${name}`,
        });
      }
    }

    {
      const regex =
        /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)\s+on\s+(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)/gi;
      let indexMatch;
      while ((indexMatch = regex.exec(guardedBody))) {
        const indexSchema = normalizeIdent(indexMatch[1] || indexMatch[3] || defaultSchema);
        const indexName = normalizeIdent(indexMatch[2]);
        targets.push({
          kind: "index",
          objectName: `${indexSchema}.${indexName}`,
        });
      }
    }

    if (targets.length > 0) {
      guardedTargets.push({
        dependency,
        targets,
      });
    }
  }
  return guardedTargets;
}

export function parseTransientObjects(sql) {
  const text = maskLiteralBodies(stripComments(sql));
  const defaultSchemas = parseDefaultSchemas(text);
  const defaultSchema = defaultSchemas[0] || "public";
  const transient = new Set();

  {
    const regex =
      /create\s+temp(?:orary)?\s+table\s+(?:if\s+not\s+exists\s+)?(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)/gi;
    let match;
    while ((match = regex.exec(text))) {
      const { schema, name } = parseQualifiedName(match[1], match[2], defaultSchema);
      transient.add(`${schema}.${name}`);
    }
  }

  const createdFunctions = new Set();
  {
    const regex =
      /create\s+(?:or\s+replace\s+)?function\s+(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)\s*\(/gi;
    let match;
    while ((match = regex.exec(text))) {
      const { schema, name } = parseQualifiedName(match[1], match[2], defaultSchema);
      createdFunctions.add(`${schema}.${name}`);
    }
  }
  {
    const regex =
      /drop\s+function\s+(?:if\s+exists\s+)?(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)/gi;
    let match;
    while ((match = regex.exec(text))) {
      const { schema, name } = parseQualifiedName(match[1], match[2], defaultSchema);
      const fqfn = `${schema}.${name}`;
      if (createdFunctions.has(fqfn)) {
        transient.add(fqfn);
      }
    }
  }

  return transient;
}

async function tableExists(client, schema, table, tableExistsCache) {
  const key = `${schema}.${table}`;
  if (tableExistsCache.has(key)) return tableExistsCache.get(key);
  const res = await client.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2
        AND table_type = 'BASE TABLE'
      LIMIT 1
    `,
    [schema, table]
  );
  const exists = res.rows.length > 0;
  tableExistsCache.set(key, exists);
  return exists;
}

async function functionExists(client, schema, functionName, functionExistsCache) {
  const key = `${schema}.${functionName}`;
  if (functionExistsCache.has(key)) return functionExistsCache.get(key);
  const res = await client.query(
    `
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1
        AND p.proname = $2
      LIMIT 1
    `,
    [schema, functionName]
  );
  const exists = res.rows.length > 0;
  functionExistsCache.set(key, exists);
  return exists;
}

async function indexExists(client, schema, indexName) {
  const res = await client.query(
    `
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'i'
        AND n.nspname = $1
        AND c.relname = $2
      LIMIT 1
    `,
    [schema, indexName]
  );
  return res.rows.length > 0;
}

async function triggerExists(client, schema, tableName, triggerName) {
  const res = await client.query(
    `
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT t.tgisinternal
        AND n.nspname = $1
        AND c.relname = $2
        AND t.tgname = $3
      LIMIT 1
    `,
    [schema, tableName, triggerName]
  );
  return res.rows.length > 0;
}

function missingObjectName(item) {
  return (
    item.fqcn ||
    item.fqtn ||
    item.fqvn ||
    item.fqmvn ||
    item.fqin ||
    item.fqfn ||
    item.key ||
    item.fqtt ||
    null
  );
}

function expectedEntryDedupKey(kind, item) {
  return `${kind}:${missingObjectName(item) ?? JSON.stringify(item)}`;
}

function dedupeExpectedObjects(expected, seenObjectKeys) {
  const deduped = {};
  for (const [kind, entries] of Object.entries(expected)) {
    deduped[kind] = [];
    for (const entry of entries) {
      const objectKey = expectedEntryDedupKey(kind, entry);
      if (seenObjectKeys.has(objectKey)) continue;
      seenObjectKeys.add(objectKey);
      deduped[kind].push(entry);
    }
  }
  return deduped;
}

function loadIgnoreSet(ignoreEntries = []) {
  const set = new Set();
  for (const entry of ignoreEntries) {
    if (entry && typeof entry.object === "string" && entry.object.trim()) {
      set.add(entry.object.trim());
    }
  }
  return set;
}

async function checkMigrationObjects(
  client,
  expected,
  tableExistsCache,
  functionExistsCache,
  ignoreObjectSet,
  transientObjectSet,
  conditionalSkipByObject
) {
  const missing = [];
  const skipped = [];
  const declaredTables = new Set(expected.tables.map((item) => `${item.schema}.${item.table}`));

  function shouldSkipObject(objectName, kind) {
    if (!objectName) return { skip: false };
    if (ignoreObjectSet.has(objectName)) {
      return { skip: true, reason: "IGNORE_RULE", trace: `${makeObjectKey(kind, objectName)} via ignore list` };
    }
    if (transientObjectSet.has(objectName)) {
      return {
        skip: true,
        reason: "TRANSIENT_SKIP",
        trace: `${makeObjectKey(kind, objectName)} transient in migration`,
      };
    }
    if (conditionalSkipByObject.has(makeObjectKey(kind, objectName))) {
      return {
        skip: true,
        reason: "CONDITIONAL_SKIP",
        trace: `${makeObjectKey(kind, objectName)} dependency absent; guarded DDL skipped`,
      };
    }
    return { skip: false };
  }

  function pushMissing(kind, item) {
    const objectName = missingObjectName(item);
    const skip = shouldSkipObject(objectName, kind);
    if (skip.skip) {
      skipped.push({ kind, object: objectName, reason: skip.reason, trace: skip.trace });
      return;
    }
    missing.push({ kind, ...item });
  }

  for (const item of expected.schemas) {
    const res = await client.query(
      `
        SELECT 1
        FROM information_schema.schemata
        WHERE schema_name = $1
        LIMIT 1
      `,
      [item.schema]
    );
    if (res.rows.length === 0) {
      pushMissing("schema", item);
    }
  }

  for (const item of expected.tables) {
    const res = await client.query(
      `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = $2
          AND table_type = 'BASE TABLE'
        LIMIT 1
      `,
      [item.schema, item.table]
    );
    if (res.rows.length === 0) {
      pushMissing("table", item);
    }
  }

  for (const item of expected.views) {
    const res = await client.query(
      `
        SELECT 1
        FROM information_schema.views
        WHERE table_schema = $1
          AND table_name = $2
        LIMIT 1
      `,
      [item.schema, item.view]
    );
    if (res.rows.length === 0) {
      pushMissing("view", item);
    }
  }

  for (const item of expected.materializedViews) {
    const res = await client.query(
      `
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'm'
          AND n.nspname = $1
          AND c.relname = $2
        LIMIT 1
      `,
      [item.schema, item.view]
    );
    if (res.rows.length === 0) {
      pushMissing("materialized_view", item);
    }
  }

  for (const item of expected.columns) {
    const tableKey = `${item.schema}.${item.table}`;
    const tableIsDeclaredHere = declaredTables.has(tableKey);
    const tableIsPresent = await tableExists(client, item.schema, item.table, tableExistsCache);
    if (!tableIsDeclaredHere && !tableIsPresent) continue;

    const res = await client.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = $3
        LIMIT 1
      `,
      [item.schema, item.table, item.column]
    );
    if (res.rows.length === 0) {
      pushMissing("column", item);
    }
  }

  for (const item of expected.indexes) {
    const tableKey = `${item.tableSchema}.${item.tableName}`;
    const tableIsDeclaredHere = declaredTables.has(tableKey);
    const tableIsPresent = await tableExists(client, item.tableSchema, item.tableName, tableExistsCache);
    if (!tableIsDeclaredHere && !tableIsPresent) continue;

    const res = await client.query(
      `
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'i'
          AND n.nspname = $1
          AND c.relname = $2
        LIMIT 1
      `,
      [item.indexSchema, item.indexName]
    );
    if (res.rows.length === 0) {
      pushMissing("index", item);
    }
  }

  for (const item of expected.types) {
    const res = await client.query(
      `
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = $1
          AND t.typname = $2
        LIMIT 1
      `,
      [item.schema, item.type]
    );
    if (res.rows.length === 0) {
      pushMissing("type", item);
    }
  }

  for (const item of expected.enumValues) {
    const res = await client.query(
      `
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE n.nspname = $1
          AND t.typname = $2
          AND e.enumlabel = $3
        LIMIT 1
      `,
      [item.schema, item.type, item.value]
    );
    if (res.rows.length === 0) {
      pushMissing("enum_value", item);
    }
  }

  for (const item of expected.functions) {
    const exists = await functionExists(client, item.schema, item.functionName, functionExistsCache);
    if (!exists) {
      pushMissing("function", item);
    }
  }

  for (const item of expected.triggers) {
    const tableKey = `${item.tableSchema}.${item.tableName}`;
    const tableIsDeclaredHere = declaredTables.has(tableKey);
    const tableIsPresent = await tableExists(client, item.tableSchema, item.tableName, tableExistsCache);
    if (!tableIsDeclaredHere && !tableIsPresent) continue;

    const res = await client.query(
      `
        SELECT 1
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal
          AND n.nspname = $1
          AND c.relname = $2
          AND t.tgname = $3
        LIMIT 1
      `,
      [item.tableSchema, item.tableName, item.triggerName]
    );
    if (res.rows.length === 0) {
      pushMissing("trigger", item);
    }
  }

  for (const item of expected.seedTables) {
    const tableIsPresent = await tableExists(client, item.schema, item.table, tableExistsCache);
    if (!tableIsPresent) {
      pushMissing("seed_rows", item);
    }
  }

  return { missing, skipped };
}

export async function verifyMigrationContent({
  client,
  migrationsDirectory,
  minNumber = 1,
  maxNumber = Number.MAX_SAFE_INTEGER,
} = {}) {
  const dirEntries = await fs.readdir(migrationsDirectory);
  const migrationFiles = dirEntries
    .filter((name) => MIGRATION_FILENAME_REGEX.test(name))
    .filter((name) => {
      const migrationNumber = Number(name.slice(0, 4));
      return migrationNumber >= minNumber && migrationNumber <= maxNumber;
    })
    .sort((a, b) => a.localeCompare(b));

  const ignoreFilePath = path.join(path.dirname(fileURLToPath(import.meta.url)), IGNORE_FILE_NAME);
  let ignoreEntries = [];
  try {
    ignoreEntries = JSON.parse(await fs.readFile(ignoreFilePath, "utf8"));
  } catch {
    ignoreEntries = [];
  }
  const ignoreObjectSet = loadIgnoreSet(ignoreEntries);

  const tableExistsCache = new Map();
  const functionExistsCache = new Map();
  const seenObjectKeys = new Set();
  const report = [];
  let totalMissing = 0;
  let totalSkipped = 0;

  for (const filename of migrationFiles) {
    const fullPath = path.join(migrationsDirectory, filename);
    const sql = await fs.readFile(fullPath, "utf8");
    const transientObjectSet = parseTransientObjects(sql);
    const expected = dedupeExpectedObjects(parseMigrationObjects(sql), seenObjectKeys);
    const conditionalSkipByObject = new Set();
    const conditionalMismatch = [];
    const guardedTargets = parseConditionalGuardedTargets(sql);
    for (const guardedTarget of guardedTargets) {
      if (guardedTarget.dependency.kind === "function") {
        const dependencyExists = await functionExists(
          client,
          guardedTarget.dependency.schema,
          guardedTarget.dependency.name,
          functionExistsCache
        );
        if (!dependencyExists) {
          for (const target of guardedTarget.targets) {
            conditionalSkipByObject.add(makeObjectKey(target.kind, target.objectName));
            if (target.kind === "function") {
              const [schema, functionName] = target.objectName.split(".");
              if (await functionExists(client, schema, functionName, functionExistsCache)) {
                conditionalMismatch.push({
                  kind: "conditional_mismatch",
                  key: target.objectName,
                  detail: "dependency_absent_target_present",
                });
              }
            } else if (target.kind === "index") {
              const [schema, indexName] = target.objectName.split(".");
              if (await indexExists(client, schema, indexName)) {
                conditionalMismatch.push({
                  kind: "conditional_mismatch",
                  key: target.objectName,
                  detail: "dependency_absent_target_present",
                });
              }
            } else if (target.kind === "trigger") {
              const [schema, tableName, triggerName] = target.objectName.split(".");
              if (await triggerExists(client, schema, tableName, triggerName)) {
                conditionalMismatch.push({
                  kind: "conditional_mismatch",
                  key: target.objectName,
                  detail: "dependency_absent_target_present",
                });
              }
            }
          }
        }
      } else if (guardedTarget.dependency.kind === "table") {
        const dependencyExists = await tableExists(
          client,
          guardedTarget.dependency.schema,
          guardedTarget.dependency.name,
          tableExistsCache
        );
        if (!dependencyExists) {
          for (const target of guardedTarget.targets) {
            conditionalSkipByObject.add(makeObjectKey(target.kind, target.objectName));
          }
        }
      }
    }

    const { missing, skipped } = await checkMigrationObjects(
      client,
      expected,
      tableExistsCache,
      functionExistsCache,
      ignoreObjectSet,
      transientObjectSet,
      conditionalSkipByObject
    );
    totalMissing += missing.length;
    if (conditionalMismatch.length > 0) {
      missing.push(...conditionalMismatch);
      totalMissing += conditionalMismatch.length;
    }
    totalSkipped += skipped.length;
    report.push({
      filename,
      expectedCounts: Object.fromEntries(
        Object.entries(expected).map(([kind, entries]) => [kind, entries.length])
      ),
      missing,
      skipped,
    });
  }

  return {
    minNumber,
    maxNumber,
    migrationCount: migrationFiles.length,
    totalMissing,
    totalSkipped,
    report,
  };
}
