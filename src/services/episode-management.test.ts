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
  playback_reference: null,
  authorized: false,
  authorization_reference: null,
};
test("Episode validation requires legitimate source evidence for preparation", () => {
  validateEpisode(draft);
  assert.match(episodeStatus(draft), /Borrador/);
  for (const change of [
    { episode_number: 0 },
    { episode_number: 1.5 },
    { title: " " },
    { authorized: true },
    { description: "x".repeat(10001) },
  ])
    assert.throws(() => validateEpisode({ ...draft, ...change }));
  const prepared = {
    ...draft,
    authorized: true,
    playback_reference: "PRIVATE TEST ONLY",
    authorization_reference: "Owner license",
  };
  validateEpisode(prepared);
  assert.equal(episodeStatus(prepared), "Preparado · privado");
});
