import test from "node:test";
import assert from "node:assert/strict";
import {
  filterPersistent,
  hasAvailableEpisode,
  type PersistentAnime,
} from "./persistent-catalog";
import { defaultFilters } from "./catalog";
const row: PersistentAnime = {
  id: "persistent-test",
  title: "Tést fixture",
  title_romaji: null,
  title_english: null,
  title_native: null,
  synopsis: null,
  genres: ["Test"],
  year: 2026,
  format: "TV",
  airing_status: "RELEASING",
  score: null,
  studio: null,
  total_episodes: null,
  catalog_episodes: [],
};
test("Persistent filters retain existing search semantics without mapping missing values to fictional metadata", () => {
  assert.equal(
    filterPersistent([row], {
      ...defaultFilters,
      query: "test fixture",
      format: "Serie",
      status: "En emisión",
    }).length,
    1,
  );
  assert.equal(
    filterPersistent([row], { ...defaultFilters, year: "2025" }).length,
    0,
  );
  assert.equal(row.total_episodes, null);
});
test("Persistent entries need an actual available, authorized, published episode reference", () => {
  assert.equal(hasAvailableEpisode(row), false);
  const e = {
    id: "test",
    episode_number: 1,
    title: "TEST ONLY",
    published_at: "2020-01-01",
    available: true,
    authorized: false,
    playback_reference: "TEST ONLY",
  };
  assert.equal(hasAvailableEpisode({ ...row, catalog_episodes: [e] }), false);
  assert.equal(
    hasAvailableEpisode({
      ...row,
      catalog_episodes: [{ ...e, authorized: true }],
    }),
    true,
  );
  assert.equal(
    hasAvailableEpisode({
      ...row,
      catalog_episodes: [
        { ...e, authorized: true, published_at: "2099-01-01" },
      ],
    }),
    false,
  );
});
