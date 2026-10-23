import { test, expect, type Page } from "@playwright/test";
const root = "https://yoru-auth-test.supabase.co";
const widths = [320, 390, 768, 1024, 1440, 1920];
const rows = (count: number, covers = false) => Array.from({ length: count }, (_, i) => ({
  id: `00000000-0000-0000-0000-${String(i + 10).padStart(12, "0")}`,
  title: i === 1
    ? count === 5
      ? "UnTítuloSinEspacios".repeat(8)
      : "Una historia extraordinariamente larga que continúa más allá del horizonte"
    : `Historia de prueba ${i + 1}`,
  title_romaji: null, title_english: null, title_native: null,
  synopsis: "Una historia de encuentros, decisiones y nuevos caminos. Cada viaje guarda un universo por descubrir. ".repeat(4),
  genres: ["Drama", "Adventure"], year: 2026, format: "TV", airing_status: "RELEASING", score: 85,
  studio: null, total_episodes: null, playback_available: false,
  cover_path: covers ? `00000000-0000-0000-0000-${String(i + 10).padStart(12, "0")}/cover.png` : null,
}));
async function mockCatalog(page: Page, count: number, covers = false) {
  const data = rows(count, covers);
  const signed: string[] = [];
  await page.route(`${root}/rest/v1/rpc/yoru_search_anime**`, (route) => route.fulfill({ json: data }));
  await page.route(`${root}/rest/v1/public_anime**`, (route) => route.fulfill({ json: data[0] }));
  await page.route(`${root}/rest/v1/public_seasons**`, (route) => route.fulfill({ json: [] }));
  await page.route(`${root}/storage/v1/object/**`, (route) => {
    if (route.request().method() === "POST") {
      signed.push(route.request().url());
      return route.fulfill({ json: { signedURL: "/object/sign/yoru-covers/cover.png?token=test" } });
    }
    return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJZkAAAAASUVORK5CYII=", "base64") });
  });
  return { data, signed };
}

for (const count of [0, 1, 2, 5, 20]) {
  test(`${count} published rows: responsive featured area, no duplicate cards and direct links`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { data } = await mockCatalog(page, count);
    await page.goto("/");
    if (!count) {
      await expect(page.locator(".home-welcome")).toBeVisible();
      await expect(page.getByRole("link", { name: "Explorar catálogo", exact: true })).toHaveAttribute("href", "/catalogo");
      await expect(page.locator(".featured-carousel")).toHaveCount(0);
    } else {
      await expect(page.locator(".featured-carousel h1")).toHaveText(data[0].title);
      await expect(page.getByRole("link", { name: "Ver ficha", exact: true })).toHaveAttribute("href", `/anime/${data[0].id}`);
      await expect(page.locator(".featured-genres")).toContainText("Drama");
      await expect(page.locator(".featured-synopsis")).toHaveText(data[0].synopsis.trim());
      await expect(page.locator(".featured-cover img")).toHaveAttribute("fetchpriority", "high");
      await expect(page.getByRole("button", { name: "Siguiente destacado", exact: true })).toHaveCount(count > 1 ? 1 : 0);
      await expect(page.locator(".featured-indicator")).toHaveCount(count > 1 ? Math.min(count, 5) : 0);
      const expectedOthers = data.slice(5, 17);
      const cards = page.locator(".home-catalog .anime-card");
      await expect(cards).toHaveCount(expectedOthers.length);
      expect(await cards.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(expectedOthers.map((anime) => `/anime/${anime.id}`));
      await expect(page.locator(".home-catalog-single")).toHaveCount(0);
    }
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (count) {
        const image = page.locator(".featured-cover img");
        await expect(image).toBeVisible();
        const shape = await image.evaluate((img) => ({ style: getComputedStyle(img).objectFit, ratio: img.clientWidth / img.clientHeight }));
        expect(shape.style).toBe("contain");
        expect(shape.ratio).toBeCloseTo(600 / 850, 2);
        await expect(page.getByRole("link", { name: "Ver ficha", exact: true })).toBeVisible();
      }
      if (count > 1) {
        await page.getByRole("button", { name: "Siguiente destacado" }).click();
        const title = page.locator(".featured-carousel h1");
        await expect(title).toHaveText(data[1].title);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const textHeight = await title.evaluate((element) => ({ height: element.clientHeight, line: parseFloat(getComputedStyle(element).lineHeight) }));
        expect(textHeight.height).toBeLessThanOrEqual(textHeight.line * 3 + 1);
        await page.getByRole("button", { name: "Destacado anterior" }).click();
        await expect(title).toHaveText(data[0].title);
      }
      if ((testInfo.project.name === "desktop" && width === 1440) || (testInfo.project.name === "mobile" && width === 390)) {
        await page.screenshot({ path: testInfo.outputPath(`home-${count}-${width}.png`), fullPage: true });
      }
    }
    if (count > 1) {
      await page.getByRole("button", { name: "Siguiente destacado" }).click();
      await expect(page.locator(".featured-carousel h1")).toHaveText(data[1].title);
      await expect(page.locator(".featured-indicator[aria-current]")).toHaveAttribute("aria-label", `Mostrar destacado 2: ${data[1].title}`);
      await page.keyboard.press("ArrowLeft");
      await expect(page.locator(".featured-carousel h1")).toHaveText(data[0].title);
      await page.getByRole("button", { name: new RegExp(`Mostrar destacado ${Math.min(count, 5)}:`) }).click();
      await expect(page.locator(".featured-carousel h1")).toHaveText(data[Math.min(count, 5) - 1].title);
    }
    if (count) {
      const selected = count > 1 ? Math.min(count, 5) - 1 : 0;
      await expect(page.getByRole("link", { name: "Ver ficha", exact: true })).toHaveAttribute("href", `/anime/${data[selected].id}`);
      if (count === 1) {
        await page.getByRole("link", { name: "Ver ficha", exact: true }).click();
        await expect(page).toHaveURL(`/anime/${data[0].id}`);
        await expect(page.locator(".detail-copy h1")).toContainText(data[0].title);
      }
    }
  });
}

test("only active featured cover loads; autoplay pauses after interaction and can resume", async ({ page, isMobile }) => {
  await page.clock.install();
  const { data, signed } = await mockCatalog(page, 5, true);
  await page.goto("/");
  await expect(page.locator(".featured-carousel h1")).toHaveText(data[0].title);
  await expect.poll(() => new Set(signed).size).toBe(1);
  await expect(page.locator(".featured-carousel img")).toHaveCount(1);
  await page.locator(".featured-carousel").hover();
  await page.clock.fastForward(21000);
  await expect(page.locator(".featured-carousel h1")).toHaveText(data[0].title);
  await page.mouse.move(0, 0);
  await page.clock.fastForward(7100);
  await expect(page.locator(".featured-carousel h1")).toHaveText(data[1].title);
  await expect.poll(() => new Set(signed).size).toBe(2);
  await page.getByRole("button", { name: "Siguiente destacado" }).click();
  await expect(page.locator(".featured-carousel h1")).toHaveText(data[2].title);
  await page.clock.fastForward(21000);
  await expect(page.locator(".featured-carousel h1")).toHaveText(data[2].title);
  const resume = page.getByRole("button", { name: "Reanudar carrusel" });
  if (isMobile) await resume.tap();
  else await resume.click();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(7100);
  await expect(page.locator(".featured-carousel h1")).toHaveText(data[3].title);
  await page.getByRole("button", { name: "Pausar carrusel" }).click();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(21000);
  await expect(page.locator(".featured-carousel h1")).toHaveText(data[3].title);
});

test("keyboard focus and reduced motion stop automatic changes", async ({ page }) => {
  await page.clock.install();
  const { data } = await mockCatalog(page, 2);
  await page.goto("/");
  await expect(page.locator(".featured-carousel h1")).toHaveText(data[0].title);
  await page.getByRole("button", { name: "Pausar carrusel" }).focus();
  await expect(page.getByRole("button", { name: "Reanudar carrusel" })).toBeFocused();
  await page.getByRole("link", { name: "Ver ficha", exact: true }).focus();
  await page.clock.fastForward(21000);
  await expect(page.locator(".featured-carousel h1")).toHaveText(data[0].title);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("link", { name: "Ver ficha", exact: true })).toBeFocused();
  await expect(page.locator(".featured-carousel h1")).toHaveText(data[1].title);
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".featured-carousel h1")).toHaveText(data[0].title);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Siguiente destacado" }).click();
  await expect(page.locator(".featured-carousel h1")).toHaveText(data[1].title);
  await expect.poll(() => page.locator(".featured-slide").evaluate((element) => element.getAnimations().length)).toBe(0);
  await expect(page.getByRole("button", { name: /carrusel/i })).toHaveCount(0);
  await page.clock.fastForward(21000);
  await expect(page.locator(".featured-carousel h1")).toHaveText(data[1].title);
});

test("horizontal touch swipe changes featured anime and vertical gestures preserve it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { data } = await mockCatalog(page, 2);
  await page.goto("/");
  await expect(page.locator(".featured-carousel h1")).toHaveText(data[0].title);
  await page.setViewportSize({ width: 390, height: 844 });
  const carousel = page.locator(".featured-carousel");
  const box = (await carousel.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  const swipe = async (start: { x: number; y: number }, end: { x: number; y: number }) => {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    for (let step = 1; step <= 5; step++) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x + (end.x - start.x) * step / 5, y: start.y + (end.y - start.y) * step / 5 }] });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  await swipe({ x: box.x + 260, y: box.y + 80 }, { x: box.x + 80, y: box.y + 80 });
  await expect(page.locator(".featured-carousel h1")).toHaveText(data[1].title);
  await expect(page).toHaveURL("/");
  await swipe({ x: box.x + 160, y: box.y + 80 }, { x: box.x + 165, y: box.y + 220 });
  await expect(page.locator(".featured-carousel h1")).toHaveText(data[1].title);
  await client.detach();
});
