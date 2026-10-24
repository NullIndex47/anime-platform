import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

export const migrationNames = [
  "20261012010000_anime_catalog.sql",
  "20261012020000_episode_management.sql",
  "20261022190000_public_catalog.sql",
  "20261023180000_public_seasons_episodes.sql",
  "20261023181000_anime_covers.sql",
];
export const expansionName = "20261024220000_episode_sources.sql";
export const readMigration = (n: string) =>
  readFile(new URL(`../supabase/migrations/${n}`, import.meta.url), "utf8");
export const backupTables = [
  "public.catalog_anime",
  "public.catalog_publication",
  "public.catalog_origins",
  "public.catalog_seasons",
  "public.catalog_episodes",
  "yoru_private.cover_objects",
  "yoru_private.provider_permissions",
] as const;
const backupSelect = `select jsonb_build_object('format','yoru-catalog-3d-v1','tables',jsonb_build_object(\n${backupTables
  .map((t) => {
    const order =
      t === "yoru_private.cover_objects"
        ? 'x.path collate "C"'
        : t === "yoru_private.provider_permissions"
          ? 'x.provider collate "C"'
          : ["public.catalog_publication", "public.catalog_origins"].includes(t)
            ? "x.anime_id"
            : "x.id";
    return `'${t}',coalesce((select jsonb_agg(to_jsonb(x) order by ${order}) from ${t} x),'[]'::jsonb)`;
  })
  .join(",\n")}\n)) as backup;`;
export const backupQuery = `-- Solo lectura de datos; UTC fija la representación de las fechas.\n-- Copia el valor JSON de backup a work/yoru-before-3e.json.\nset time zone 'UTC';\n${backupSelect}`;

export interface CatalogBackup {
  format: string;
  tables: Record<string, Record<string, unknown>[]>;
}
export async function open3dDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;`);
  for (const name of migrationNames) await db.exec(await readMigration(name));
  return db;
}
export async function captureBackup(db: PGlite) {
  await db.exec("set time zone 'UTC'");
  return (await db.query<{ backup: CatalogBackup }>(backupSelect)).rows[0]
    .backup;
}
export function parseBackup(text: string): CatalogBackup {
  let value = JSON.parse(text.replace(/^\uFEFF/, ""));
  // SQL Editor JSON export and a copied JSON cell are both accepted.
  if (Array.isArray(value) && value.length === 1) value = value[0].backup;
  if (value?.backup) value = value.backup;
  if (typeof value === "string") value = JSON.parse(value);
  if (
    value?.format !== "yoru-catalog-3d-v1" ||
    !value.tables ||
    Object.keys(value.tables).length !== backupTables.length ||
    backupTables.some((t) => !Array.isArray(value.tables[t]))
  )
    throw new Error("Invalid backup");
  return value;
}
export async function restoreCatalogLocally(db: PGlite, backup: CatalogBackup) {
  // This function only accepts an embedded PGlite database, never a remote URL.
  const insert = async (table: string, rows: unknown[]) => {
    if (!rows.length) return;
    const columns = (
      await db.query<{ name: string }>(
        `select attname as name from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped and attgenerated='' order by attnum`,
        [table],
      )
    ).rows
      .map((r) => `"${r.name}"`)
      .join(",");
    await db.query(
      `insert into ${table}(${columns}) select ${columns} from jsonb_populate_recordset(null::${table},$1::jsonb)`,
      [JSON.stringify(rows)],
    );
  };
  {
    await db.exec(
      "delete from yoru_private.provider_budget; delete from yoru_private.provider_permissions",
    );
    await insert(
      "yoru_private.provider_permissions",
      backup.tables["yoru_private.provider_permissions"],
    );
    await insert(
      "public.catalog_anime",
      backup.tables["public.catalog_anime"].map((r) => ({
        ...r,
        cover_path: null,
      })),
    );
    await insert(
      "yoru_private.cover_objects",
      backup.tables["yoru_private.cover_objects"],
    );
    for (const row of backup.tables["public.catalog_anime"])
      await db.query(
        "update public.catalog_anime set cover_path=$1 where id=$2",
        [row.cover_path, row.id],
      );
    for (const table of [
      "public.catalog_publication",
      "public.catalog_origins",
      "public.catalog_seasons",
      "public.catalog_episodes",
    ])
      await insert(table, backup.tables[table]);
  }
  if (!isDeepStrictEqual(await captureBackup(db), backup))
    throw new Error("Restored data differs");
}
export async function verifyBackup(backup: CatalogBackup) {
  const db = await open3dDatabase();
  try {
    await restoreCatalogLocally(db, backup);
    const legacyBefore = (
      await db.query(
        "select pg_get_functiondef('public.yoru_save_episode(uuid,uuid,uuid,integer,text,text,text,boolean,text)'::regprocedure) as definition",
      )
    ).rows;
    await db.exec(await readMigration(expansionName));
    if (!isDeepStrictEqual(await captureBackup(db), backup))
      throw new Error("Expansion changed existing data");
    const legacyAfter = (
      await db.query(
        "select pg_get_functiondef('public.yoru_save_episode(uuid,uuid,uuid,integer,text,text,text,boolean,text)'::regprocedure) as definition",
      )
    ).rows;
    if (!isDeepStrictEqual(legacyAfter, legacyBefore))
      throw new Error("Legacy RPC changed");
    const status = (
      await db.query<{ status: { ok: boolean } }>(
        "select yoru_private.phase3e_status() status",
      )
    ).rows[0].status;
    if (!status.ok) throw new Error("Expansion check failed");
    return Object.fromEntries(
      backupTables.map((t) => [t, backup.tables[t].length]),
    );
  } finally {
    await db.close();
  }
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const [argument, ...rest] = process.argv.slice(2);
    if (rest.length || !argument) throw new Error("Argument required");
    if (argument === "--query") console.log(backupQuery);
    else {
      const contents = await readFile(argument, "utf8");
      const counts = await verifyBackup(parseBackup(contents));
      console.log(
        "Respaldo restaurado y expansión comprobada en PostgreSQL local. Ninguna conexión remota.",
      );
      console.log(
        "SHA256:",
        createHash("sha256").update(contents).digest("hex"),
      );
      console.log(JSON.stringify(counts));
    }
  } catch {
    console.error(
      "No se pudo verificar el respaldo. Usa --query para obtener la consulta y guarda su JSON completo; no apliques SQL hasta resolverlo. No se muestran sus datos privados.",
    );
    process.exitCode = 1;
  }
}
