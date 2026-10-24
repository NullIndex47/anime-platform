import test from "node:test";
import assert from "node:assert/strict";
import {
  episodeStatus,
  validateEpisode,
  type EpisodeInput,
} from "./episode-management";
const draft: EpisodeInput = {
  episode_number: 1,
  title: "Test",
  description: null,
  sources: [],
};
test("Episode validation supports drafts and multiple active sources without legacy authorization fields", () => {
  validateEpisode(draft);
  assert.match(episodeStatus(draft), /Borrador/);
  for (const change of [
    { episode_number: 0 },
    { episode_number: 1.5 },
    { title: " " },
    { description: "x".repeat(10001) },
  ])
    assert.throws(() => validateEpisode({ ...draft, ...change }));
  const prepared = {
    ...draft,
    sources: [
      {
        id: "test",
        name: "Test",
        player_type: "html5" as const,
        url: "https://media.w3.org/2010/05/sintel/trailer.mp4",
        priority: 0,
        active: true,
      },
    ],
  };
  validateEpisode(prepared);
  assert.equal(episodeStatus(prepared), "Preparado · privado");
});
