import test from "node:test";
import assert from "node:assert/strict";
import {
  readFile,
  access,
  mkdtemp,
  writeFile,
  rm,
  stat,
} from "node:fs/promises";
import { resolve } from "node:path";
import {
  parseConfig,
  previewConfig,
  commandArgs,
  deployPreview,
} from "../../scripts/deploy-preview";
import { handleApi, type Env } from "../../worker";
const values = {
  VITE_SUPABASE_URL: "https://preview-test.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_TEST_ONLY",
};
const raw = parseConfig(await readFile("wrangler.jsonc", "utf8"));
test("Generated config puts public Builds variables in previews.vars without altering Production or routes", () => {
  const original = structuredClone(raw),
    result = previewConfig(raw, values, process.cwd());
  assert.deepEqual(raw, original);
  assert.deepEqual(result.vars, raw.vars);
  assert.deepEqual(result.previews!.vars, {
    ANILIST_ENABLED: "false",
    SUPABASE_URL: values.VITE_SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: values.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
  assert.deepEqual(result.assets.run_worker_first, ["/api/*"]);
  assert.equal(result.assets.binding, "ASSETS");
  assert.equal(result.main, resolve("worker/index.ts"));
  assert.equal(
    previewConfig(raw, { ...values, ANILIST_ENABLED: "true" }, process.cwd())
      .previews!.vars!.ANILIST_ENABLED,
    "false",
  );
});
test("Missing inputs, secret keys and credential-bearing URLs fail closed without echoing inputs", () => {
  for (const env of [
    {},
    { ...values, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_REJECT_ME" },
    { ...values, VITE_SUPABASE_PUBLISHABLE_KEY: "eyJ.service_role.JWT" },
    { ...values, VITE_SUPABASE_URL: "https://user:REJECT_ME@example.com" },
    { ...values, VITE_SUPABASE_URL: "http://example.com" },
  ])
    assert.throws(
      () => previewConfig(raw, env, process.cwd()),
      (e) =>
        e instanceof Error &&
        !e.message.includes("REJECT_ME") &&
        !e.message.includes("service_role"),
    );
});
test("Wrapper uses actual wrangler preview, private temporary files, cleanup after failure, and dry-run never publishes", async () => {
  const root = await mkdtemp(resolve("work/preview-wrapper-test-"));
  await writeFile(resolve(root, "wrangler.jsonc"), JSON.stringify(raw));
  try {
    for (const dry of [false, true]) {
      let path = "";
      const code = await deployPreview(dry, root, values, async (args, env) => {
        path = args[args.indexOf("--config") + 1];
        const c = JSON.parse(await readFile(path, "utf8"));
        assert.equal((await stat(path)).mode & 0o777, 0o600);
        assert.deepEqual(
          args,
          commandArgs(path, dry, resolve(path, "../bundle")),
        );
        assert.ok(
          !args.join(" ").includes(values.VITE_SUPABASE_PUBLISHABLE_KEY),
        );
        assert.ok(env.WRANGLER_LOG_PATH!.startsWith(resolve(path, "..")));
        assert.equal(
          dry ? c.vars.SUPABASE_URL : c.previews.vars.SUPABASE_URL,
          values.VITE_SUPABASE_URL,
        );
        assert.equal(
          dry ? c.vars.ANILIST_ENABLED : c.previews.vars.ANILIST_ENABLED,
          "false",
        );
        return 1;
      });
      assert.equal(code, 1);
      await assert.rejects(access(path));
    }
    await assert.rejects(
      deployPreview(false, root, {}, async () => {
        assert.fail("must not invoke Wrangler");
      }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Generated Preview runtime reaches admin status with disabled integration, and normal users remain forbidden", async () => {
  const c = previewConfig(raw, values, process.cwd());
  const env = {
    ...c.previews!.vars,
    ASSETS: { fetch: async () => new Response("asset") },
  } as Env;
  const req = () =>
    new Request("https://preview.example/api/admin/anilist", {
      method: "POST",
      headers: { Authorization: "Bearer test.jwt.token" },
      body: JSON.stringify({ action: "status" }),
    });
  const response = await handleApi(req(), env, async () =>
    Response.json({ metadata: true, images: true }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { enabled: false, images: false });
  assert.equal(
    (
      await handleApi(req(), env, async () =>
        Response.json({ code: "42501" }, { status: 403 }),
      )
    ).status,
    403,
  );
});
