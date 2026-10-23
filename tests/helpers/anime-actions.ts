import type { Page } from "@playwright/test";
export async function revealAnimeActions(page: Page) {
  const menu = page.locator(".admin-row-menu").first();
  if ((await menu.getAttribute("open")) === null)
    await menu.locator("summary").click();
}
