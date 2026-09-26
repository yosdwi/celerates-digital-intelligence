// Runs only against the disposable local HTTP harness; never a live ERP.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
export async function runBrowserJourney({ base, cookies }) {
  assert.equal(new URL(base).hostname, "127.0.0.1");
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.ERP_BROWSER_EXECUTABLE || undefined,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-zygote",
      "--single-process",
    ],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.addCookies(
      cookies.map(([name, value]) => ({ name, value, url: base })),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/pmo/invoices");
    const trigger = page.getByRole("button", { name: /^Celerates Agent/ });
    await trigger.click();
    const panel = page.getByRole("dialog", { name: "Celerates Agent" });
    await panel
      .getByRole("heading", {
        name: "Invoice perlu ditinjau untuk submission",
        exact: true,
      })
      .waitFor();
    await panel.getByText("Mengapa perlu ditinjau?", { exact: true }).click();
    assert.match(await panel.innerText(), /bukan tagihan belum dibayar/);
    const screenshotDir = process.env.ERP_SCREENSHOT_DIR;
    if (screenshotDir) {
      await mkdir(screenshotDir, { recursive: true });
      await page.screenshot({
        path: screenshotDir + "/operational-desktop.png",
      });
    }
    await page.keyboard.press("Escape");
    assert.equal(await panel.count(), 0);
    assert.equal(
      await trigger.evaluate((el) => el === document.activeElement),
      true,
    );
    await trigger.click();
    await panel
      .getByRole("heading", {
        name: "Invoice perlu ditinjau untuk submission",
        exact: true,
      })
      .waitFor();
    const source = panel
      .locator('a[href*="/pmo/invoices/"][href$="/edit"]')
      .first();
    await source.click();
    await page.waitForURL(/\/pmo\/invoices\/.+\/edit$/);
    await trigger.click();
    await panel.getByRole("button", { name: "Masukan", exact: true }).click();
    await panel
      .getByLabel("Judul", { exact: true })
      .fill("Synthetic floating feedback");
    await panel
      .getByLabel("Kendala / kebutuhan", { exact: true })
      .fill("Submission rule needs a BA review on the current invoice page.");
    await panel
      .getByLabel("Hasil yang diharapkan", { exact: true })
      .fill("Keep the page and release context.");
    await panel
      .getByRole("button", { name: "Kirim Feature Request", exact: true })
      .click();
    await panel
      .getByText("Masukan tersimpan di Feature Request.", { exact: false })
      .waitFor();
    await panel
      .getByRole("button", { name: "Perlu perhatian", exact: true })
      .click();
    await page.route("**/api/operations/context?*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"unavailable"}',
      }),
    );
    await panel.getByRole("button", { name: "Muat ulang ringkasan" }).click();
    await panel.getByRole("alert").waitFor();
    assert.equal(
      await panel
        .getByRole("heading", {
          name: "Invoice perlu ditinjau untuk submission",
        })
        .count(),
      0,
      "failed refresh clears stale facts",
    );
    await page.unroute("**/api/operations/context?*");
    await panel.getByRole("button", { name: "Muat ulang ringkasan" }).click();
    await panel
      .getByRole("heading", { name: "Invoice perlu ditinjau untuk submission" })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    const box = await panel.boundingBox();
    assert.ok(
      box && box.x >= 0 && box.x + box.width <= 390 && box.y >= 0,
      "mobile panel stays in viewport",
    );
    if (screenshotDir)
      await page.screenshot({
        path: screenshotDir + "/operational-mobile.png",
      });
    assert.deepEqual(errors, [], "no browser runtime exceptions");
    console.log(
      "PASS: browser source navigation, keyboard focus, inline contextual feedback, error recovery and mobile viewport",
    );
  } finally {
    await browser.close();
  }
}
