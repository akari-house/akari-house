import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const cryptoScript = resolve("scripts/recovery/backup-crypto.mjs");
const validationScript = resolve("scripts/recovery/validate-restore.mjs");
const temporaryDirectories: string[] = [];
const encryptionKey = Buffer.alloc(32, 17).toString("base64");

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "akari-recovery-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("D1 recovery tooling", () => {
  it("encrypts and decrypts backup material without changing it", async () => {
    const directory = await temporaryDirectory();
    const source = join(directory, "source.sql.gz");
    const encrypted = join(directory, "source.sql.gz.enc");
    const restored = join(directory, "restored.sql.gz");
    const original = Buffer.from("AKARI recovery fixture\nwith binary \u0000 data");
    await writeFile(source, original);

    await run(process.execPath, [cryptoScript, "encrypt", source, encrypted], {
      env: {
        ...process.env,
        RECOVERY_BACKUP_ENCRYPTION_KEY: encryptionKey,
      },
    });
    expect(await readFile(encrypted)).not.toEqual(original);

    await run(process.execPath, [cryptoScript, "decrypt", encrypted, restored], {
      env: {
        ...process.env,
        RECOVERY_BACKUP_ENCRYPTION_KEY: encryptionKey,
      },
    });
    expect(await readFile(restored)).toEqual(original);
  });

  it("rejects a modified encrypted backup", async () => {
    const directory = await temporaryDirectory();
    const source = join(directory, "source.sql.gz");
    const encrypted = join(directory, "source.sql.gz.enc");
    const restored = join(directory, "restored.sql.gz");
    await writeFile(source, "sensitive database backup");
    await run(process.execPath, [cryptoScript, "encrypt", source, encrypted], {
      env: {
        ...process.env,
        RECOVERY_BACKUP_ENCRYPTION_KEY: encryptionKey,
      },
    });
    const changed = await readFile(encrypted);
    changed[changed.length - 1] = changed[changed.length - 1] ^ 0xff;
    await writeFile(encrypted, changed);

    await expect(
      run(process.execPath, [cryptoScript, "decrypt", encrypted, restored], {
        env: {
          ...process.env,
          RECOVERY_BACKUP_ENCRYPTION_KEY: encryptionKey,
        },
      }),
    ).rejects.toThrow();
  });

  it("accepts an integrity-checked restore with matching critical counts", async () => {
    const directory = await temporaryDirectory();
    const production = join(directory, "production.json");
    const restored = join(directory, "restored.json");
    const integrity = join(directory, "integrity.json");
    const evidence = join(directory, "evidence.json");
    const evidenceSql = join(directory, "evidence.sql");
    const counts = [
      { tableName: "users", rowCount: 12 },
      { tableName: "projects", rowCount: 4 },
      { tableName: "ambassador_campaigns", rowCount: 3 },
      { tableName: "audit_logs", rowCount: 98 },
    ];
    await Promise.all([
      writeFile(production, JSON.stringify([{ results: counts }])),
      writeFile(restored, JSON.stringify([{ results: counts }])),
      writeFile(
        integrity,
        JSON.stringify([{ results: [{ integrity_check: "ok" }] }]),
      ),
    ]);

    await run(
      process.execPath,
      [
        validationScript,
        production,
        restored,
        integrity,
        evidence,
        evidenceSql,
      ],
      {
        env: {
          ...process.env,
          RECOVERY_TIMESTAMP: "20260725T160000Z",
          RECOVERY_BACKUP_KEY:
            "recovery-backups/20260725T160000Z/akari-house-db.sql.gz.enc",
          RECOVERY_BACKUP_SHA256: "a".repeat(64),
          RECOVERY_WORKFLOW_URL: "https://github.com/example/actions/runs/1",
          RECOVERY_TEMP_DATABASE_ID: "temporary-database-id",
        },
      },
    );

    const payload = JSON.parse(await readFile(evidence, "utf8")) as {
      result: string;
      integrity: string;
      restoredCounts: Record<string, number>;
    };
    expect(payload.result).toBe("passed");
    expect(payload.integrity).toBe("ok");
    expect(payload.restoredCounts.users).toBe(12);
    const sql = await readFile(evidenceSql, "utf8");
    expect(sql).toContain("'d1_backup', 'passed'");
    expect(sql).toContain("'d1_restore_test', 'passed'");
  });

  it("rejects a restore when a critical table count differs", async () => {
    const directory = await temporaryDirectory();
    const production = join(directory, "production.json");
    const restored = join(directory, "restored.json");
    const integrity = join(directory, "integrity.json");
    const evidence = join(directory, "evidence.json");
    const evidenceSql = join(directory, "evidence.sql");
    const baseCounts = [
      { tableName: "users", rowCount: 12 },
      { tableName: "projects", rowCount: 4 },
      { tableName: "ambassador_campaigns", rowCount: 3 },
      { tableName: "audit_logs", rowCount: 98 },
    ];
    await Promise.all([
      writeFile(production, JSON.stringify([{ results: baseCounts }])),
      writeFile(
        restored,
        JSON.stringify([
          {
            results: baseCounts.map((item) =>
              item.tableName === "users" ? { ...item, rowCount: 11 } : item,
            ),
          },
        ]),
      ),
      writeFile(
        integrity,
        JSON.stringify([{ results: [{ integrity_check: "ok" }] }]),
      ),
    ]);

    await expect(
      run(
        process.execPath,
        [
          validationScript,
          production,
          restored,
          integrity,
          evidence,
          evidenceSql,
        ],
        {
          env: {
            ...process.env,
            RECOVERY_TIMESTAMP: "20260725T160000Z",
            RECOVERY_BACKUP_KEY: "recovery-backups/test.enc",
            RECOVERY_BACKUP_SHA256: "b".repeat(64),
            RECOVERY_WORKFLOW_URL: "https://github.com/example/actions/runs/1",
            RECOVERY_TEMP_DATABASE_ID: "temporary-database-id",
          },
        },
      ),
    ).rejects.toThrow(/does not match production/);
  });
});
