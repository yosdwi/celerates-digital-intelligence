// Sales Wave 1 browser journey. Runs only against the disposable local HTTP harness.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

export async function runSalesPilotBrowserJourney({ base, cookies, db, tracker }) {
  assert.equal(new URL(base).hostname, "127.0.0.1");
  const browserBase = base.replace("127.0.0.1", "localhost");
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.ERP_BROWSER_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote", "--single-process"],
  });
  let cdp;
  let authenticatorId;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies(cookies.map(([name, value]) => ({ name, value, url: browserBase })));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable", { enableUI: false });
    ({ authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    }));

    await page.goto(browserBase + "/profile");
    await page.getByPlaceholder("Nama perangkat (opsional)").fill("Synthetic Pilot Device");
    await page.getByPlaceholder("Password saat ini").fill("Synthetic-Only-Password-123");
    const registerResponse = page.waitForResponse(
      (response) => response.url().endsWith("/api/passkey/register") && response.request().method() === "POST",
      { timeout: 15_000 },
    );
    await page.getByRole("button", { name: "Daftarkan biometrik / passkey" }).click();
    const saved = await registerResponse;
    assert.equal(saved.status(), 200, "passkey registration POST must succeed");
    await page.getByText("Synthetic Pilot Device", { exact: true }).waitFor({ timeout: 15_000 });
    const [passkey] = await db`SELECT id,label,revoked_at FROM auth_passkey_credentials WHERE label='Synthetic Pilot Device'`;
    assert.ok(passkey && !passkey.revoked_at, "passkey persisted after verified registration ceremony");

    await context.clearCookies();
    await page.goto(browserBase + "/login");
    const passkeyLogin = page.getByRole("button", { name: "Masuk dengan biometrik / passkey" });
    await passkeyLogin.waitFor();
    await passkeyLogin.click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });

    await page.goto(browserBase + "/sales/opportunity-tracker");
    await page.getByRole("heading", { name: "Opportunity Tracker" }).waitFor();
    const row = page.getByRole("row").filter({ hasText: "Synthetic Client" }).first();
    await row.waitFor();
    const salesText = await row.innerText();
    assert.match(salesText, /Qualified/);
    assert.ok(salesText.includes(tracker.opty_no), "Sales row retains upstream opportunity number");
    assert.equal(
      await row.getByRole("button", { name: "Convert to Requisition" }).count(),
      0,
      "converted Sales record cannot be converted twice from UI",
    );

    await page.goto(browserBase + "/ta");
    await page.getByRole("heading", { name: "Requisition" }).waitFor();
    const taBody = await page.locator("body").innerText();
    assert.match(taBody, /Synthetic Client/);
    assert.match(taBody, /Engineer/);

    const screenshotDir = process.env.ERP_SCREENSHOT_DIR;
    if (screenshotDir) {
      await mkdir(screenshotDir, { recursive: true });
      await page.screenshot({ path: screenshotDir + "/sales-wave1-e2e.png", fullPage: true });
    }
    assert.deepEqual(errors, [], "Sales pilot browser journey has no runtime exceptions");
    console.log("PASS: passkey enrollment/login + Sales Opportunity → PQ/Requisition → TA browser journey");
  } finally {
    if (cdp && authenticatorId) {
      await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId }).catch(() => {});
      await cdp.send("WebAuthn.disable").catch(() => {});
    }
    await browser.close();
  }
}
