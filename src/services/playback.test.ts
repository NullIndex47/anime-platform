import test from "node:test";
import assert from "node:assert/strict";
import { safePlaybackUrl, validateSource } from "./playback";
export const invalidPlaybackUrls = [
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "//player.vimeo.com/video/1",
  "http://player.vimeo.com/video/1",
  "https://player.vimeo.com.evil.test/video/1",
  "https://player.vimeo.com@evil.test/video/1",
  "https://user:pass@player.vimeo.com/video/1",
  "https://player.vimeo.com:443/video/1",
  "https://player.vimeo.com/video/1?autoplay=1",
  "https://player.vimeo.com/video/1#x",
  "https://player.vimeo.com/video/%31",
  "https://player.vimeo.com/video/../1",
  "https://player.vimeo.com\\@evil.test/video/1",
  '<iframe src="https://player.vimeo.com/video/1">',
  "https://127.0.0.1/video.mp4",
  "https://archive.org/download/a/../../evil.mp4",
  "https://media.w3.org/2010/05/a.mp4?redirect=https://evil.test",
  "https://media.w3.org/2010/05/a.m3u8",
];
test("playback only accepts explicit HTTPS provider embed routes and compatible media files", () => {
  for (const value of invalidPlaybackUrls) {
    assert.equal(safePlaybackUrl("iframe", value), false, value);
    assert.equal(safePlaybackUrl("html5", value), false, value);
  }
  assert.ok(
    safePlaybackUrl(
      "iframe",
      "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ",
    ),
  );
  assert.ok(
    safePlaybackUrl("iframe", "https://player.vimeo.com/video/76979871"),
  );
  assert.ok(
    safePlaybackUrl("html5", "https://media.w3.org/2010/05/sintel/trailer.mp4"),
  );
  assert.ok(
    safePlaybackUrl("html5", "https://archive.org/download/own-film/test.webm"),
  );
  assert.equal(
    safePlaybackUrl("iframe", "https://www.youtube.com/watch?v=aqz-KE-bpKQ"),
    false,
  );
});
test("inactive legacy links can be reviewed but cannot be activated without validation", () => {
  const source = {
    id: "test",
    name: "Migrada",
    player_type: "iframe" as const,
    url: "PRIVATE LEGACY",
    priority: 0,
    active: false,
  };
  validateSource(source);
  assert.throws(() => validateSource({ ...source, active: true }));
});
