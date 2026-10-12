import test from "node:test";
import assert from "node:assert/strict";
import {
  readFile,
  mkdtemp,
  writeFile,
  stat,
  access,
  rm,
} from "node:fs/promises";
import { resolve } from "node:path";
import { parseConfig } from "../../scripts/deploy-preview";
import {
  productionConfig,
  commandArgs,
  deployProduction,
} from "../../scripts/deploy-production";
import { handleApi, type Env } from "../../worker";
const raw = parseConfig(await readFile("wrangler.jsonc", "utf8"));
const values = {
  VITE_SUPABASE_URL: "https://production-test.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_TEST_ONLY",
};
test("Production receives top-level runtime bindings, preserves Worker identity/routes and leaves Preview unchanged", () => {
  const original = structuredClone(raw),
    result = productionConfig(raw, values, process.cwd());
  assert.deepEqual(raw, original);
  assert.deepEqual(result.previews, raw.previews);
  assert.equal(result.name, raw.name);
  assert.deepEqual(result.routes, raw.routes);
  assert.deepEqual(result.assets.run_worker_first, ["/api/*"]);
  assert.equal(result.assets.binding, "ASSETS");
  assert.equal(result.vars.SUPABASE_URL, values.VITE_SUPABASE_URL);
  assert.equal(
    result.vars.SUPABASE_PUBLISHABLE_KEY,
    values.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  assert.equal(result.vars.ANILIST_ENABLED, "false");
  assert.equal(
    productionConfig(raw, { ...values, ANILIST_ENABLED: "true" }, process.cwd())
      .vars.ANILIST_ENABLED,
    "false",
  );
});
test("Production rejects missing values, secret keys and unsafe URLs before invoking Wrangler", async () => {
  for (const env of [
    {},
    { ...values, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_REJECTED" },
    { ...values, VITE_SUPABASE_PUBLISHABLE_KEY: "eyJ.service_role.jwt" },
    { ...values, VITE_SUPABASE_URL: "https://user:password@example.com" },
  ]) {
    assert.throws(() => productionConfig(raw, env, process.cwd()));
    await assert.rejects(
      deployProduction(true, process.cwd(), env, async () => {
        assert.fail("Must not deploy");
      }),
    );
  }
});
test("Production commands use only deploy; private config is removed on success, failure and exception", async () => {
  const root = await mkdtemp(resolve("work/production-test-"));
  await writeFile(resolve(root, "wrangler.jsonc"), JSON.stringify(raw));
  try {
    for (const [dry, code] of [
      [true, 0],
      [false, 1],
    ] as const) {
      let path = "";
      assert.equal(
        await deployProduction(dry, root, values, async (args, env) => {
          path = args[args.indexOf("--config") + 1];
          assert.deepEqual(
            args,
            commandArgs(path, dry, resolve(path, "../bundle")),
          );
          assert.equal(args[0], "deploy");
          assert.equal(args.includes("--dry-run"), dry);
          assert.ok(
            !args.join(" ").includes(values.VITE_SUPABASE_PUBLISHABLE_KEY),
          );
          assert.ok(env.WRANGLER_LOG_PATH!.startsWith(resolve(path, "..")));
          assert.equal((await stat(path)).mode & 0o777, 0o600);
          const config = JSON.parse(await readFile(path, "utf8"));
          assert.deepEqual(config.previews, raw.previews);
          assert.equal(config.vars.SUPABASE_URL, values.VITE_SUPABASE_URL);
          return code;
        }),
        code,
      );
      await assert.rejects(access(path));
    }
    let path = "";
    await assert.rejects(
      deployProduction(true, root, values, async (args) => {
        path = args[args.indexOf("--config") + 1];
        throw Error("test failure");
      }),
    );
    await assert.rejects(access(path));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Generated Production env returns disabled integration for admin and still rejects normal users", async () => {
  const env = {
    ...productionConfig(raw, values, process.cwd()).vars,
    ASSETS: { fetch: async () => new Response("asset") },
  } as Env;
  const req = () =>
    new Request("https://yoru.example/api/admin/anilist", {
      method: "POST",
      headers: { Authorization: "Bearer test.jwt.token" },
      body: JSON.stringify({ action: "status" }),
    });
  const r = await handleApi(req(), env, async () =>
    Response.json({ metadata: true, images: true }),
  );
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { enabled: false, images: false });
  assert.equal(
    (
      await handleApi(req(), env, async () =>
        Response.json({ code: "42501" }, { status: 403 }),
      )
    ).status,
    403,
  );
});
