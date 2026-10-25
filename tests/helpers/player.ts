import { type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
export const root = "https://yoru-auth-test.supabase.co";
export const animeId = "00000000-0000-0000-0000-000000000010",
  seasonId = "00000000-0000-0000-0000-000000000020";
export const episodeId = (n: number) =>
  `00000000-0000-0000-0000-${String(n + 30).padStart(12, "0")}`;
export const clip = "https://media.w3.org/2010/05/yoru-player-test.webm";
export const embed = "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ";
export const anime = {
  id: animeId,
  title: "YORU · Luz de prueba",
  genres: [],
  title_romaji: null,
  title_english: null,
  title_native: null,
  synopsis: "Película gráfica original para verificar el reproductor.",
  year: 2026,
  format: "SPECIAL",
  airing_status: "FINISHED",
  score: null,
  studio: null,
  total_episodes: 4,
  cover_path: null,
  playback_available: true,
  catalog_publication: { state: "published" },
};
export const season = {
  id: seasonId,
  anime_id: animeId,
  season_number: 1,
  name: "Pruebas originales",
  published: true,
};
export const episodes = [1, 2, 3, 4].map((n) => ({
  id: episodeId(n),
  anime_id: animeId,
  season_id: seasonId,
  episode_number: n,
  title: ["La primera luz", "Tres caminos", "Próximamente", "Otro encuentro"][
    n - 1
  ],
  description: "Vídeo gráfico creado para las pruebas de YORU.",
  playback_available: n !== 3,
}));
export const sources = [
  {
    id: "00000000-0000-0000-0000-000000000100",
    name: "Vídeo original",
    player_type: "html5",
    url: clip,
    priority: 0,
    active: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000101",
    name: "Iframe oficial",
    player_type: "iframe",
    url: embed,
    priority: 1,
    active: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000102",
    name: "Servidor alternativo",
    player_type: "html5",
    url: "https://media.w3.org/2010/05/yoru-player-backup.webm",
    priority: 2,
    active: true,
  },
];
export async function setupPlayer(page: Page, hidden = false) {
  const requests: string[] = [];
  const media = await readFile(
    new URL("../fixtures/yoru-player-test.webm", import.meta.url),
  );
  page.on("request", (r) => {
    if (/media.w3.org|youtube-nocookie.com/.test(r.url()))
      requests.push(r.url());
  });
  // All provider responses are controlled fixtures; no commercial footage or remote test assets.
  await page.route("https://media.w3.org/**", (r) =>
    r.fulfill({
      contentType: "video/webm",
      body: media,
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.route(embed, (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body style="margin:0;background:#080a0f"><video style="width:100%;height:100vh" controls src="${clip}"></video></body></html>`,
    }),
  );
  await page.route(`${root}/rest/v1/public_episodes**`, (r) => {
    const p = new URL(r.request().url()).searchParams;
    let rows = hidden ? [] : [...episodes];
    if (p.has("id"))
      return r.fulfill({
        json: rows.find((e) => `eq.${e.id}` === p.get("id")) || null,
      });
    if (p.get("episode_number")?.startsWith("lt."))
      rows = rows
        .filter(
          (e) => e.episode_number < Number(p.get("episode_number")!.slice(3)),
        )
        .reverse()
        .slice(0, 1);
    if (p.get("episode_number")?.startsWith("gt."))
      rows = rows
        .filter(
          (e) => e.episode_number > Number(p.get("episode_number")!.slice(3)),
        )
        .slice(0, 1);
    return r.fulfill({ json: rows });
  });
  await page.route(`${root}/rest/v1/public_anime**`, (r) =>
    r.fulfill({ json: anime }),
  );
  await page.route(`${root}/rest/v1/public_seasons**`, (r) =>
    r.fulfill({
      json: new URL(r.request().url()).searchParams.has("id")
        ? season
        : [season],
    }),
  );
  await page.route(`${root}/rest/v1/public_episode_sources**`, (r) => {
    const id = new URL(r.request().url()).searchParams
      .get("episode_id")
      ?.slice(3);
    const available =
      id === episodeId(3)
        ? []
        : id === episodeId(2)
          ? sources
          : sources.slice(0, 1);
    return r.fulfill({
      json: available.map(({ active: _, ...s }) => ({ ...s, episode_id: id })),
    });
  });
  return requests;
}
