import { expect, type Page } from "@playwright/test";
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
const session = {
  access_token: `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`,
  refresh_token: "test",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
};
export async function setupManagement(
  page: Page,
  seed: {
    animes?: Record<string, unknown>[];
    seasons?: Record<string, unknown>[];
    episodes?: Record<string, unknown>[];
  } = {},
) {
  let animes: Record<string, unknown>[] = seed.animes || [],
    seasons: Record<string, unknown>[] = seed.seasons || [],
    episodes: Record<string, unknown>[] = seed.episodes || [],
    counter = 0,
    fail = false;
  const calls: string[] = [];
  const reads: string[] = [];
  let failEpisodeRead = false;
  await page.route(`${endpoint}/auth/v1/**`, (r) =>
    r.fulfill({ json: r.request().url().includes("/token") ? session : user }),
  );
  await page.route(`${endpoint}/rest/v1/profiles**`, (r) =>
    r.fulfill({ json: [{ id: user.id, username: "Test_User" }] }),
  );
  await page.route(`${endpoint}/rest/v1/rpc/**`, (r) => {
    const name = r.request().url().split("/").at(-1)!;
    const b = r.request().postDataJSON();
    calls.push(name);
    if (name === "yoru_admin_episodes") {
      reads.push("catalog_episodes");
      if (failEpisodeRead) { failEpisodeRead = false; return r.fulfill({ status: 500, json: { message: "Read failed" } }); }
      return r.fulfill({ json: episodes.filter(e => e.anime_id === b.p_anime_id && e.season_id === b.p_season_id).sort((a,b) => Number(a.episode_number)-Number(b.episode_number)) });
    }
    if (name === "yoru_source_reports") return r.fulfill({ json: [] });
    if (name === "yoru_is_admin") return r.fulfill({ json: true });
    if (fail) {
      fail = false;
      return r.fulfill({ status: 409, json: { code: "23505" } });
    }
    if (name === "yoru_create_anime") {
      const id = `anime-${++counter}`;
      animes.push({
        ...b.p_metadata,
        id,
        catalog_publication: { state: "draft" },
        catalog_origins: null,
      });
      return r.fulfill({ json: id });
    }
    if (name === "yoru_update_anime")
      animes = animes.map((a) =>
        a.id === b.p_id ? { ...a, ...b.p_metadata } : a,
      );
    if (name === "yoru_delete_anime") {
      animes = animes.filter((a) => a.id !== b.p_id);
      seasons = seasons.filter((s) => s.anime_id !== b.p_id);
      episodes = episodes.filter((e) => e.anime_id !== b.p_id);
    }
    if (name === "yoru_save_season") {
      const row = {
        id: b.p_id || `season-${++counter}`,
        anime_id: b.p_anime_id,
        season_number: b.p_number,
        name: b.p_name,
      };
      seasons = b.p_id
        ? seasons.map((s) => (s.id === b.p_id ? row : s))
        : [...seasons, row];
    }
    if (name === "yoru_delete_season") {
      expect(b.p_confirm).toBe(true);
      seasons = seasons.filter((s) => s.id !== b.p_id);
      episodes = episodes.filter((e) => e.season_id !== b.p_id);
    }
    if (name === "yoru_delete_episode")
      episodes = episodes.filter((e) => e.id !== b.p_id);
    if (name === "yoru_save_episode") {
      if (
        episodes.some(
          (episode) =>
            episode.season_id === b.p_season_id &&
            episode.episode_number === b.p_number &&
            episode.id !== b.p_id,
        )
      )
        return r.fulfill({ status: 409, json: { code: "23505" } });
      expect(b.available).toBeUndefined();
      expect(b.published_at).toBeUndefined();
      const row = {
        id: b.p_id || `episode-${++counter}`,
        anime_id: b.p_anime_id,
        season_id: b.p_season_id,
        episode_number: b.p_number,
        title: b.p_title,
        description: b.p_description,
        sources: b.p_sources,
        published: false,
      };
      episodes = b.p_id
        ? episodes.map((e) => (e.id === b.p_id ? row : e))
        : [...episodes, row];
    }
    return r.fulfill({ json: null });
  });
  for (const [table, items] of [
    ["catalog_anime", () => animes],
    ["catalog_seasons", () => seasons],
    ["catalog_episodes", () => episodes],
  ] as const)
    await page.route(`${endpoint}/rest/v1/${table}**`, (r) => {
      reads.push(table);
      if (table === "catalog_episodes" && failEpisodeRead) {
        failEpisodeRead = false;
        return r.fulfill({ status: 500, json: { message: "Read failed" } });
      }
      const params = new URL(r.request().url()).searchParams;
      const anime = params.get("anime_id")?.replace("eq.", ""),
        season = params.get("season_id")?.replace("eq.", "");
      return r.fulfill({
        json: items()
          .filter(
            (v) =>
              (!anime || v.anime_id === anime) &&
              (!season || v.season_id === season),
          )
          .sort(
            (a, b) =>
              Number(a.season_number || a.episode_number || 0) -
              Number(b.season_number || b.episode_number || 0),
          ),
      });
    });
  await page.route("**/api/admin/anilist", (r) => {
    expect(r.request().postDataJSON()).toEqual({ action: "status" });
    return r.fulfill({ json: { enabled: false, images: false } });
  });
  await page.goto("/catalogo");
  await page.evaluate(
    (value) =>
      localStorage.setItem(
        "sb-yoru-auth-test-auth-token",
        JSON.stringify(value),
      ),
    session,
  );
  await page.goto("/admin");
  return {
    calls,
    reads,
    episodes: () => episodes,
    failNextEpisodeRead: () => {
      failEpisodeRead = true;
    },
    duplicate: () => {
      fail = true;
    },
  };
}
