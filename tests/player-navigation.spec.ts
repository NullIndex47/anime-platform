import { test, expect, type Page } from '@playwright/test';
import { anime } from '../src/data/anime';
const titles = ['El tren de las seis', 'Una carta sin destino', 'El bosque que recuerda', 'La ciudad sobre las nubes', 'Un nombre en el viento', 'El otro lado del cielo'];
async function checkEpisode(page: Page, number: number) {
  await expect(page).toHaveURL(new RegExp(`/demo/anime/el-viaje-de-aoi/episodio/${number}$`));
  await expect(page.locator('h1')).toHaveText(`${titles[number - 1]}.`);
  await expect(page).toHaveTitle(`El viaje de Aoi · Episodio ${number}: ${titles[number - 1]} — YORU`);
  await expect(page.locator('video')).toHaveCount(1);
  await expect(page.locator('.player-section')).toHaveCount(1);
  await expect(page.locator('video')).toBeVisible();
  await expect(page.locator('.comments')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Mostrar/ })).toBeVisible();
  for (const [label, destination] of [['Anterior', number - 1], ['Siguiente', number + 1]] as const) {
    if (destination < 1 || destination > 6) await expect(page.getByRole('button', { name: label, exact: true })).toBeDisabled();
    else await expect(page.getByRole('link', { name: label, exact: true })).toHaveAttribute('href', `/demo/anime/el-viaje-de-aoi/episodio/${destination}`);
  }
}
test('Siguiente repeatedly replaces the player and releases the previous media', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/demo/anime/el-viaje-de-aoi/episodio/1');
  for (let round = 0; round < 3; round++) {
    await checkEpisode(page, 1);
    for (let number = 2; number <= 6; number++) {
      // Exercise playback and episode-specific spoiler state before navigating.
      await page.locator('video').evaluate(async video => {
        await video.play();
        (window as any).previousVideo = video;
      });
      await page.getByRole('button', { name: /Mostrar/ }).click();
      await page.getByRole('link', { name: 'Siguiente', exact: true }).click();
      await checkEpisode(page, number);
      await expect.poll(() => page.evaluate(() => {
        const video = (window as any).previousVideo as HTMLVideoElement;
        return { connected: video.isConnected, paused: video.paused, source: video.getAttribute('src'), ready: video.readyState, network: video.networkState };
      })).toEqual({ connected: false, paused: true, source: null, ready: 0, network: 0 });
    }
    for (let number = 5; number >= 1; number--) {
      await page.getByRole('link', { name: 'Anterior', exact: true }).click();
      await checkEpisode(page, number);
    }
  }
  await page.getByRole('link', { name: 'Siguiente', exact: true }).click();
  await checkEpisode(page, 2);
  await page.goBack();
  await checkEpisode(page, 1);
  await page.goForward();
  await checkEpisode(page, 2);
  await page.getByRole('link', { name: 'Todos los episodios', exact: true }).click();
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.locator('.player-section')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('server controls and error retry do not duplicate players', async ({ page }) => {
  await page.goto('/demo/anime/el-viaje-de-aoi/episodio/1');
  const servers = page.getByRole('group', { name: 'Servidores de vídeo' }).getByRole('button');
  await expect(servers).toHaveCount(3);
  // The demo has one available server; keep future servers disabled.
  await expect(servers.nth(1)).toBeDisabled();
  await expect(servers.nth(2)).toBeDisabled();
  for (let i = 0; i < 5; i++) {
    await servers.first().click();
    await checkEpisode(page, 1);
  }
  await page.locator('video').evaluate(async video => {
    await video.play();
    (window as any).previousVideo = video;
    video.dispatchEvent(new Event('error'));
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  expect(await page.evaluate(() => ({paused:(window as any).previousVideo.paused, source:(window as any).previousVideo.getAttribute('src')}))).toEqual({paused:true,source:null});
  await page.getByRole('button', {name:'Volver a intentar'}).click();
  await checkEpisode(page, 1);
});

// Cover every published multi-episode title, including the 12-episode series.
for (const series of anime.filter(item => item.episodes.length > 1)) {
  test(`Siguiente keeps one player throughout ${series.title}`, async ({ page }) => {
    await page.goto(`/demo/anime/${series.id}/episodio/1`);
    for (const episode of series.episodes) {
      if (episode.number > 1) await page.getByRole('link', { name: 'Siguiente', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/demo/anime/${series.id}/episodio/${episode.number}$`));
      await expect(page.locator('h1')).toHaveText(`${episode.title}.`);
      await expect(page.locator('video')).toHaveCount(1);
      await expect(page.locator('.player-section')).toHaveCount(1);
      await expect(page.locator('.comments')).toHaveCount(1);
    }
    await expect(page.getByRole('button', { name: 'Siguiente', exact: true })).toBeDisabled();
  });
}
