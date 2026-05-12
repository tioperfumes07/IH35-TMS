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
    const regex = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(?:"?([a-zA-Z_][\w$]*)"?)[.])?(?:"?([a-zA-Z_][\w$]*)"?)/gi;
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

async function checkMigrationObjects(client, expected, tableExistsCache, ignoreObjectSet) {
  const missing = [];
  const declaredTables = new Set(expected.tables.map((item) => `${item.schema}.${item.table}`));

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
      const objectName = missingObjectName(item);
      if (!objectName || !ignoreObjectSet.has(objectName)) missing.push({ kind: "schema", ...item });
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
      const objectName = missingObjectName(item);
      if (!objectName || !ignoreObjectSet.has(objectName)) missing.push({ kind: "table", ...item });
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
      const objectName = missingObjectName(item);
      if (!objectName || !ignoreObjectSet.has(objectName)) missing.push({ kind: "view", ...item });
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
      const objectName = missingObjectName(item);
      if (!objectName || !ignoreObjectSet.has(objectName)) missing.push({ kind: "materialized_view", ...item });
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
      const objectName = missingObjectName(item);
      if (!objectName || !ignoreObjectSet.has(objectName)) missing.push({ kind: "column", ...item });
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
      const objectName = missingObjectName(item);
      if (!objectName || !ignoreObjectSet.has(objectName)) missing.push({ kind: "index", ...item });
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
      const objectName = missingObjectName(item);
      if (!objectName || !ignoreObjectSet.has(objectName)) missing.push({ kind: "type", ...item });
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
      const objectName = missingObjectName(item);
      if (!objectName || !ignoreObjectSet.has(objectName)) missing.push({ kind: "enum_value", ...item });
    }
  }

  for (const item of expected.functions) {
    const res = await client.query(
      `
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = $1
          AND p.proname = $2
        LIMIT 1
      `,
      [item.schema, item.functionName]
    );
    if (res.rows.length === 0) {
      const objectName = missingObjectName(item);
      if (!objectName || !ignoreObjectSet.has(objectName)) missing.push({ kind: "function", ...item });
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
      const objectName = missingObjectName(item);
      if (!objectName || !ignoreObjectSet.has(objectName)) missing.push({ kind: "trigger", ...item });
    }
  }

  for (const item of expected.seedTables) {
    const tableIsPresent = await tableExists(client, item.schema, item.table, tableExistsCache);
    if (!tableIsPresent) {
      const objectName = missingObjectName(item);
      if (!objectName || !ignoreObjectSet.has(objectName)) missing.push({ kind: "seed_rows", ...item });
    }
  }

  return missing;
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
  const seenObjectKeys = new Set();
  const report = [];
  let totalMissing = 0;

  for (const filename of migrationFiles) {
    const fullPath = path.join(migrationsDirectory, filename);
    const sql = await fs.readFile(fullPath, "utf8");
    const expected = dedupeExpectedObjects(parseMigrationObjects(sql), seenObjectKeys);
    const missing = await checkMigrationObjects(client, expected, tableExistsCache, ignoreObjectSet);
    totalMissing += missing.length;
    report.push({
      filename,
      expectedCounts: Object.fromEntries(
        Object.entries(expected).map(([kind, entries]) => [kind, entries.length])
      ),
      missing,
    });
  }

  return {
    minNumber,
    maxNumber,
    migrationCount: migrationFiles.length,
    totalMissing,
    report,
  };
}
