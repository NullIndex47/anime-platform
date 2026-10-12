import test from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  imageUrl,
  preview,
  readAniList,
  retrySeconds,
} from "../../worker/anilist";
import { handleApi, type Env } from "../../worker";
const media = {
  id: 1,
  type: "ANIME",
  title: { romaji: "Test fixture" },
  description: "<b>Text</b>",
  episodes: null,
  coverImage: { large: "https://s4.anilist.co/file/anilistcdn/cover.jpg" },
};
const env: Env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  ANILIST_ENABLED: "true",
  ASSETS: { fetch: async () => new Response("asset") },
};
const request = (body: object, token = "valid.test.jwt") =>
  new Request("https://yoru.example/api/admin/anilist", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
test("Incomplete metadata remains nullable, images require permission and unsafe URLs are dropped", () => {
  const m = preview(media, false);
  assert.equal(m.total_episodes, null);
  assert.equal(m.cover_url, null);
  assert.equal(m.synopsis, "Text");
  assert.equal(m.score, null);
  assert.ok(preview(media, true).cover_url);
  assert.equal(imageUrl("https://evil.example/image"), null);
  assert.equal(imageUrl("javascript:alert(1)"), null);
  assert.throws(() => preview({ ...media, id: null }, false), ApiError);
  assert.throws(() => preview({ ...media, type: "MANGA" }, false), ApiError);
});
test("Retry headers, empty results, network, malformed JSON and partial GraphQL errors", async () => {
  assert.equal(retrySeconds(new Headers(), 1000), 60);
  assert.equal(retrySeconds(new Headers({ "Retry-After": "10" }), 1000), 10);
  assert.equal(
    retrySeconds(new Headers({ "X-RateLimit-Reset": "21" }), 1000),
    20,
  );
  const response = await readAniList("query", {}, async () =>
    Response.json({ data: { Page: { media: [] } } }),
  );
  assert.deepEqual(response.data.Page?.media, []);
  for (const fetcher of [
    async () => {
      throw Error("network");
    },
    async () => new Response("bad"),
    async () => Response.json({ data: {}, errors: [{ status: 500 }] }),
  ])
    await assert.rejects(readAniList("query", {}, fetcher), ApiError);
  await assert.rejects(
    readAniList(
      "query",
      {},
      async () =>
        new Response("", { status: 429, headers: { "Retry-After": "60" } }),
    ),
    (e: unknown) =>
      e instanceof ApiError && e.status === 429 && e.retryAfter === 60,
  );
});
test("Direct Worker requests deny anonymous, forged/normal users and disabled provider before AniList", async () => {
  let upstream = 0;
  const denied: typeof fetch = async (url) => {
    if (String(url).includes("graphql")) upstream++;
    return Response.json({ code: "42501" }, { status: 403 });
  };
  assert.equal(
    (
      await handleApi(
        new Request("https://yoru.example/api/admin/anilist", {
          method: "POST",
          body: "{}",
        }),
        env,
        denied,
      )
    ).status,
    401,
  );
  for (const action of ["search", "preview", "import", "status"])
    assert.equal(
      (
        await handleApi(
          request({ action, id: 1, search: "Test" }, "forged.jwt.admin"),
          env,
          denied,
        )
      ).status,
      403,
    );
  const allowed: typeof fetch = async () =>
    Response.json({ metadata: false, images: false });
  assert.equal(
    (await handleApi(request({ action: "import", id: 1 }), env, allowed))
      .status,
    403,
  );
  assert.equal(upstream, 0);
});
test("Worker refetches by ID, ignores injected metadata, caches briefly, and reauthorizes cache hits", async () => {
  let upstream = 0,
    checks = 0;
  let args: Record<string, unknown> = {};
  let denied = false;
  const fetcher: typeof fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("yoru_provider_status")) {
      checks++;
      return denied
        ? Response.json({ code: "42501" }, { status: 403 })
        : Response.json({ metadata: true, images: false });
    }
    if (u.includes("reserve")) return Response.json(0);
    if (u.includes("graphql")) {
      upstream++;
      return Response.json({ data: { Media: media } });
    }
    args = JSON.parse(String(init?.body));
    return Response.json("persisted-id");
  };
  const r = await handleApi(
    request({
      action: "import",
      id: 1,
      title: "Injected",
      state: "published",
      episodes: [1],
    }),
    env,
    fetcher,
  );
  assert.equal(r.status, 201);
  assert.equal((args.p_metadata as { title: string }).title, "Test fixture");
  assert.equal(args.p_cover, null);
  assert.equal("state" in (args.p_metadata as object), false);
  assert.equal(
    (await handleApi(request({ action: "preview", id: 1 }), env, fetcher))
      .status,
    200,
  );
  assert.equal(upstream, 1);
  denied = true;
  assert.equal(
    (await handleApi(request({ action: "preview", id: 1 }), env, fetcher))
      .status,
    403,
  );
  assert.equal(checks, 3);
});
test("Shared reservations prevent upstream calls; 429 persists cooldown; duplicate becomes 409", async () => {
  const uniqueEnv = { ...env, SUPABASE_URL: "https://rate.supabase.co" };
  let upstream = 0,
    cooldown = 0;
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).includes("status"))
      return Response.json({ metadata: true, images: false });
    if (String(url).includes("reserve")) return Response.json(12);
    upstream++;
    assert.ok(init);
    return Response.json({});
  };
  const r = await handleApi(
    request({ action: "preview", id: 2 }),
    uniqueEnv,
    fetcher,
  );
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("Retry-After"), "12");
  assert.equal(upstream, 0);
  const limited: typeof fetch = async (url) => {
    if (String(url).includes("status"))
      return Response.json({ metadata: true, images: false });
    if (String(url).includes("reserve")) return Response.json(0);
    if (String(url).includes("cooldown")) {
      cooldown++;
      return Response.json(null);
    }
    return new Response("", { status: 429, headers: { "Retry-After": "60" } });
  };
  assert.equal(
    (await handleApi(request({ action: "preview", id: 2 }), uniqueEnv, limited))
      .status,
    429,
  );
  assert.equal(cooldown, 1);
  const duplicate: typeof fetch = async (url) => {
    if (String(url).includes("status"))
      return Response.json({ metadata: true, images: false });
    if (String(url).includes("reserve")) return Response.json(0);
    if (String(url).includes("graphql"))
      return Response.json({ data: { Media: { ...media, id: 2 } } });
    return Response.json({ code: "23505" }, { status: 409 });
  };
  assert.equal(
    (
      await handleApi(
        request({ action: "import", id: 2 }),
        uniqueEnv,
        duplicate,
      )
    ).status,
    409,
  );
});

test("Build variables do not substitute Worker runtime bindings; configured runtime can report disabled integration", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(
      String(url),
      "https://test.supabase.co/rest/v1/rpc/yoru_provider_status",
    );
    assert.equal(
      (init?.headers as Record<string, string>).apikey,
      "sb_publishable_test",
    );
    return Response.json({ metadata: false, images: false });
  };
  const buildOnly = {
    ASSETS: env.ASSETS,
    VITE_SUPABASE_URL: env.SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
  };
  const missing = await handleApi(
    request({ action: "status" }),
    buildOnly,
    fetcher,
  );
  assert.equal(missing.status, 503);
  assert.equal(calls, 0);
  const configured = await handleApi(
    request({ action: "status" }),
    env,
    fetcher,
  );
  assert.equal(configured.status, 200);
  assert.deepEqual(await configured.json(), { enabled: false, images: false });
});
