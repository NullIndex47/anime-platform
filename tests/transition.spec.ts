import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import {
  open3dDatabase,
  readMigration,
  expansionName,
} from "../scripts/phase3e-backup";
import { phase3dBuild } from "./helpers/phase3d-build";
const endpoint = "https://yoru-auth-test.supabase.co";
const user = {
  id: "00000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.com",
  app_metadata: { provider: "google" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;
test("real 3D bundle and 3E frontend share expanded PostgreSQL and support frontend rollback", async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(120000);
  const dist = await phase3dBuild(info.project.name);
  const db = await open3dDatabase();
  try {
    await db.exec(
      `insert into auth.users values('${user.id}');insert into yoru_private.administrators(user_id) values('${user.id}');set role authenticated`,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user.id,
    ]);
    const anime = (
      await db.query<{ id: string }>(
        `select public.yoru_create_anime('{"title":"YORU TRANSICIÓN · PRUEBA PRIVADA","genres":[]}') id`,
      )
    ).rows[0].id;
    const season = (
      await db.query<{ id: string }>(
        "select public.yoru_save_season($1,null,1,'Transición') id",
        [anime],
      )
    ).rows[0].id;
    const episode = (
      await db.query<{ id: string }>(
        "select public.yoru_save_episode($1,$2,null,1,'Original',null,'PRIVATE-3D',true,'PRIVATE-PERMISSION') id",
        [anime, season],
      )
    ).rows[0].id;
    await db.exec("reset role");
    await db.exec(await readMigration(expansionName));
    await db.exec(await readMigration("20261025230000_playback_providers.sql"));
    await db.exec("set role authenticated");
    await page.addInitScript(
      ({ user, token }) =>
        localStorage.setItem(
          "sb-yoru-auth-test-auth-token",
          JSON.stringify({
            access_token: token,
            refresh_token: "test",
            token_type: "bearer",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user,
          }),
        ),
      { user, token },
    );
    await page.route(`${endpoint}/auth/v1/**`, (r) =>
      r.fulfill({ json: user }),
    );
    await page.route("**/api/admin/anilist", (r) =>
      r.fulfill({ json: { enabled: false, images: false } }),
    );
    const rpcNames = new Set([
      "yoru_is_admin",
      "yoru_admin_episodes_v2",
      "yoru_save_episode",
      "yoru_save_episode_v2",
      "yoru_source_reports",
      "yoru_set_episode_publication",
    ]);
    const called: string[] = [];
    await page.route(`${endpoint}/rest/v1/**`, async (r) => {
      const url = new URL(r.request().url()),
        resource = url.pathname.split("/").at(-1)!;
      if (resource === "profiles")
        return r.fulfill({ json: [{ id: user.id, username: "Test_User" }] });
      try {
        if (url.pathname.includes("/rpc/")) {
          if (!rpcNames.has(resource))
            throw new Error(`Unexpected RPC ${resource}`);
          called.push(resource);
          const args = r.request().postDataJSON() || {},
            keys = Object.keys(args);
          if (keys.some((k) => !/^p_[a-z_]+$/.test(k)))
            throw new Error("Invalid argument");
          const values = keys.map((k) =>
            args[k] !== null && typeof args[k] === "object"
              ? JSON.stringify(args[k])
              : args[k],
          );
          const sql = `select public.${resource}(${keys.map((k, i) => `${k} => $${i + 1}`).join(",")}) result`;
          return r.fulfill({
            json:
              (await db.query<{ result: unknown }>(sql, values)).rows[0]
                ?.result ?? null,
          });
        }
        const tables = new Set([
          "catalog_anime",
          "catalog_seasons",
          "catalog_episodes",
          "public_anime",
          "public_seasons",
          "public_episodes",
          "public_episode_sources",
        ]);
        if (!tables.has(resource)) throw new Error("Unexpected table");
        const values: string[] = [],
          where: string[] = [];
        for (const key of [
          "id",
          "anime_id",
          "season_id",
          "episode_id",
          "episode_number",
        ]) {
          const filter = url.searchParams.get(key);
          if (filter) {
            const [op, ...value] = filter.split(".");
            const operator = (
              { eq: "=", lt: "<", gt: ">" } as Record<string, string>
            )[op];
            if (!operator) throw new Error("Unexpected filter");
            values.push(value.join("."));
            where.push(`a.${key}${operator}$${values.length}`);
          }
        }
        const columns =
          resource === "catalog_anime"
            ? "a.*,jsonb_build_object('state',p.state) catalog_publication,null::jsonb catalog_origins"
            : "a.*";
        const from =
          resource === "catalog_anime"
            ? "public.catalog_anime a left join public.catalog_publication p on p.anime_id=a.id"
            : `public.${resource} a`;
        const order = url.searchParams
          .get("order")
          ?.startsWith("episode_number.desc")
          ? "episode_number desc"
          : resource.includes("episode") &&
              resource !== "public_episode_sources"
            ? "episode_number"
            : resource.includes("season")
              ? "season_number"
              : "id";
        const rows = (
          await db.query(
            `select ${columns} from ${from} ${where.length ? "where " + where.join(" and ") : ""} order by a.${order}`,
            values,
          )
        ).rows;
        return r.fulfill({
          json: url.searchParams.get("limit") === "1" ? rows.slice(0, 1) : rows,
        });
      } catch (error) {
        return r.fulfill({
          status: 400,
          json: {
            code: (error as { code?: string }).code || "TEST",
            message: "Local database rejected request",
          },
        });
      }
    });
    let legacy = true;
    await page.route(`${baseURL}/**`, async (r) => {
      if (!legacy || new URL(r.request().url()).pathname.startsWith("/api/"))
        return r.fallback();
      const path = new URL(r.request().url()).pathname;
      const file = resolve(
        dist,
        path.startsWith("/assets/") || path.startsWith("/artwork/")
          ? `.${path}`
          : "index.html",
      );
      if (!file.startsWith(dist + "/")) throw new Error("Invalid fixture path");
      const contentType =
        (
          {
            ".js": "text/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
            ".html": "text/html",
          } as Record<string, string>
        )[extname(file)] || "application/octet-stream";
      await r.fulfill({ contentType, body: await readFile(file) });
    });
    const openEditor = async () => {
      await page.goto("/admin");
      await page
        .getByRole("button", { name: "Temporadas y episodios" })
        .click();
      await page.getByRole("button", { name: "Ver episodios" }).click();
      await page.getByRole("button", { name: "Editar episodio" }).click();
    };
    await openEditor();
    await expect(
      page.getByLabel("Referencia del permiso o licencia (opcional)"),
    ).toHaveValue("PRIVATE-PERMISSION");
    await page.getByLabel("Título del episodio").fill("Guardado en 3D migrado");
    await page
      .getByRole("button", { name: "Guardar episodio privado", exact: true })
      .click();
    await expect(
      page.getByText("1. Guardado en 3D migrado", { exact: true }),
    ).toBeVisible();
    expect(called).toContain("yoru_save_episode");
    legacy = false;
    await openEditor();
    await expect(
      page.getByLabel("Referencia del permiso o licencia (opcional)"),
    ).toHaveCount(0);
    // The migrated source stays inactive; the new UI replaces it independently.
    await page.getByLabel("Nombre del servidor").fill("Clip original");
    await page.getByLabel("Proveedor", { exact: true }).selectOption("html5");
    const clip = "https://media.w3.org/2010/05/yoru-player-test.webm";
    await page.getByLabel("URL del servidor").fill(clip);
    await page.getByLabel("Fuente activa").check();
    await page
      .getByRole("button", { name: "Guardar episodio privado", exact: true })
      .click();
    await expect(
      page.getByText("1. Guardado en 3D migrado", { exact: true }),
    ).toBeVisible();
    expect(called).toContain("yoru_save_episode_v2");
    legacy = true;
    await openEditor();
    await expect(
      page.getByLabel("Referencia privada de reproducción (opcional)"),
    ).toHaveValue("PRIVATE-3D");
    await page.getByLabel("Título del episodio").fill("Recuperado en 3D");
    await page
      .getByRole("button", { name: "Guardar episodio privado", exact: true })
      .click();
    await expect(
      page.getByText("1. Recuperado en 3D", { exact: true }),
    ).toBeVisible();
    legacy = false;
    await openEditor();
    await expect(page.getByLabel("Nombre del servidor")).toHaveValue(
      "Clip original",
    );
    await expect(page.getByLabel("Fuente activa")).toBeChecked();
    await page.route(clip, (r) =>
      r.fulfill({
        contentType: "video/webm",
        path: "tests/fixtures/yoru-player-test.webm",
      }),
    );
    await page
      .getByRole("button", { name: "Probar servidor 1", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Prueba privada del servidor" }),
    ).toBeVisible();
    await page.locator("video").evaluate((v: HTMLVideoElement) => v.play());
    await expect
      .poll(() =>
        page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime),
      )
      .toBeGreaterThan(0.1);
    await page.getByRole("button", { name: "Cerrar prueba privada" }).click();
    await expect(page.locator("video,iframe")).toHaveCount(0);
    expect(
      (await db.query("select * from public.public_episodes")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.public_episode_sources")).rows,
    ).toHaveLength(0);
  } finally {
    await db.close();
  }
});
