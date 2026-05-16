import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError } from "../accounting/shared.js";
import { pool } from "../auth/db.js";
import {
  findMigrationDrift,
  getMigrationLedgerSnapshot,
  listExpectedMigrations,
  skipMigrationVerificationEnabled,
} from "../lib/migration-status.js";

import { resolveMonorepoRoot } from "../lib/monorepo-root.js";

const repoRoot = resolveMonorepoRoot(import.meta.url);

function ownerAdministrator(role: string) {
  return role === "Owner" || role === "Administrator";
}

function safeMigrationFilename(name: string): boolean {
  return /^\d{4}[a-z]?_[A-Za-z0-9._-]+\.sql$/i.test(name);
}

export async function registerMigrationStatusRoutes(app: FastifyInstance) {
  const readMigrationHealth = async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ownerAdministrator(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const client = await pool.connect();
    try {
      const drift = await findMigrationDrift(client, repoRoot);
      const expected = await listExpectedMigrations(repoRoot);
      const snapshot = await getMigrationLedgerSnapshot(client, repoRoot);

      const payload = {
        applied: snapshot.canonicalApplied,
        expected,
        missingInDB: drift.missingInDB,
        extraInDB: drift.extraInDB,
        mirrorApplied: snapshot.mirrorApplied,
        ledgerDivergence: {
          onlyInCanonical: snapshot.onlyInCanonical,
          onlyInMirror: snapshot.onlyInMirror,
        },
        checksumMismatches: snapshot.checksumMismatches,
        canonicalLedger: "_system._schema_migrations",
        mirrorLedger: "ih35_migrations.applied_migrations",
        ok: drift.missingInDB.length === 0,
      };

      if (!skipMigrationVerificationEnabled() && drift.missingInDB.length > 0) {
        return reply.code(503).send(payload);
      }
      return reply.code(200).send(payload);
    } finally {
      client.release();
    }
  };

  app.get("/api/v1/admin/health/migrations", readMigrationHealth);
  app.get("/api/v1/internal/migrations/status", readMigrationHealth);

  app.get("/api/v1/admin/migrations/file", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ownerAdministrator(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = z.object({ name: z.string().min(8).max(220) }).safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const name = parsed.data.name;
    if (!safeMigrationFilename(name)) return reply.code(400).send({ error: "invalid_migration_name" });

    const candidates = [path.join(repoRoot, "db", "migrations", name), path.join(repoRoot, "apps", "backend", "migrations", name)];
    const hit = candidates.find((p) => fs.existsSync(p));
    if (!hit) return reply.code(404).send({ error: "migration_not_found" });

    const sql = fs.readFileSync(hit, "utf8");
    return reply.code(200).send({ name, sql });
  });
}
