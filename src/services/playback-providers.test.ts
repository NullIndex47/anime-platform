import test from "node:test";
import assert from "node:assert/strict";
import {
  playbackProviders,
  resolvePlaybackInput,
  normalizePlaybackSource,
  safePlaybackUrl,
  playbackIframePolicy,
} from "./playback";
import {
  providerUrls,
  rejectedProviderUrls,
} from "./playback-provider.fixtures";
import { validateEpisode } from "./episode-management";

test("each iframe has a closed provider policy; unknown URLs get none and no provider can open popups or navigate top", () => {
  for (const { provider, type, url } of providerUrls) {
    const policy = playbackIframePolicy(url);
    if (type === "html5") {
      assert.equal(policy, undefined);
      continue;
    }
    assert.ok(policy, provider);
    const established = ["youtube", "vimeo"].includes(provider);
    assert.equal(
      policy.sandbox,
      established
        ? "allow-scripts allow-same-origin allow-presentation"
        : "allow-scripts allow-same-origin",
    );
    assert.equal(
      policy.allow,
      established
        ? "fullscreen; picture-in-picture; encrypted-media"
        : "fullscreen; picture-in-picture",
    );
    for (const token of policy.sandbox.split(" "))
      assert.ok(
        ["allow-scripts", "allow-same-origin", "allow-presentation"].includes(
          token,
        ),
        token,
      );
    assert.doesNotMatch(
      policy.sandbox,
      /popups|top-navigation|downloads|forms/,
    );
  }
  for (const url of rejectedProviderUrls)
    assert.equal(playbackIframePolicy(url), undefined, url);
});

for (const provider of playbackProviders) {
  test(`${provider.name}: verified routes, inferred type, strict origins and malformed URLs`, () => {
    for (const { url, type } of providerUrls.filter(
      (p) => p.provider === provider.id,
    )) {
      assert.equal(safePlaybackUrl(type, url), true, url);
      assert.equal(
        safePlaybackUrl(type === "iframe" ? "html5" : "iframe", url),
        false,
        url,
      );
      const resolved = resolvePlaybackInput(url)!;
      assert.equal(resolved.provider.id, provider.id);
      assert.equal(resolved.provider.type, type);
      assert.equal(resolved.url, url);
    }
    for (const url of rejectedProviderUrls)
      assert.equal(safePlaybackUrl(provider.type, url), false, url);
  });
}

test("documented Streamtape public links convert locally; unknown links/flags/HTML do not", () => {
  for (const suffix of ["", "/own-film.mp4"]) {
    const url = `https://streamtape.com/v/YoruTest12345abC${suffix}`;
    const resolved = resolvePlaybackInput(url)!;
    assert.equal(resolved.url, "https://streamtape.com/e/YoruTest12345abC");
    assert.equal(resolved.provider.id, "streamtape");
    assert.equal(
      safePlaybackUrl("iframe", url),
      false,
      "public links cannot be mounted directly",
    );
  }
  for (const url of [
    "https://streamtape.com/v/a?autoplay=1",
    "https://streamtape.com/v/a/../b",
    "https://streamtape.com/v/a/%61",
    '<iframe src="https://streamtape.com/e/a">',
    "https://uqload.vc/yorutest0001.html",
    "https://streamwish.com/e/yorutest0001",
    "https://earnvids.com/embed/yorutest0001",
    "javascript:alert(1)",
  ])
    assert.equal(resolvePlaybackInput(url), undefined, url);
});

test("saving with Enter normalizes public input and keeps existing/legacy source identity and flags", () => {
  const source = {
    id: "same",
    name: "Mi servidor",
    priority: 3,
    active: true,
    player_type: "html5" as const,
    url: "https://streamtape.com/v/YoruTest12345abC/own-film.mp4",
  };
  const normalized = normalizePlaybackSource(source);
  assert.deepEqual(normalized, {
    ...source,
    player_type: "iframe",
    url: "https://streamtape.com/e/YoruTest12345abC",
  });
  assert.match(source.url, /\/v\//, "input is not mutated");
  validateEpisode({
    title: "Test",
    episode_number: 1,
    description: null,
    sources: [source],
  });
  const legacy = { ...source, active: false, url: "PRIVATE LEGACY" };
  assert.equal(normalizePlaybackSource(legacy), legacy);
  for (const { url, type } of providerUrls) {
    const existing = { ...source, player_type: type, url };
    assert.deepEqual(normalizePlaybackSource(existing), existing);
  }
});
