import test from "node:test";
import assert from "node:assert/strict";
import { validateCover, MAX_COVER_BYTES } from "./covers";
test("covers validate allowlisted MIME, nonempty bounded size and matching magic bytes", async () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(
    await validateCover(new File([png], "cover.png", { type: "image/png" })),
    "png",
  );
  assert.equal(
    await validateCover(
      new File([new Uint8Array([255, 216, 255])], "cover.jpg", {
        type: "image/jpeg",
      }),
    ),
    "jpg",
  );
  assert.equal(
    await validateCover(
      new File(["RIFF1234WEBP"], "cover.webp", { type: "image/webp" }),
    ),
    "webp",
  );
  for (const f of [
    new File([png], "x.svg", { type: "image/svg+xml" }),
    new File([], "x.png", { type: "image/png" }),
    new File(["text"], "x.png", { type: "image/png" }),
    new File([new Uint8Array(MAX_COVER_BYTES + 1)], "x.png", {
      type: "image/png",
    }),
  ])
    await assert.rejects(validateCover(f));
});
