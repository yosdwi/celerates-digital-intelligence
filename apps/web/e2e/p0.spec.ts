import { test, expect } from "@playwright/test";
import fs from "node:fs";
const output = "../../docs/implementation/exports";

async function noOverflow(page: any) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

test("product, all workspace surfaces and mobile layout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  fs.mkdirSync(output, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Your data/ })).toBeVisible();
  await page.screenshot({
    path: `${output}/product-overview.png`,
    fullPage: true,
  });
  for (const path of [
    "/app",
    "/app/presales",
    "/app/exceptions",
    "/app/human-service",
    "/app/management",
    "/app/sources",
    "/app/system",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Loading workspace…")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await noOverflow(page);
  }
  await page.goto("/app/presales");
  await expect(
    page.getByRole("button", { name: /Digital operations workspace/ }),
  ).toBeVisible();
  await page.screenshot({
    path: `${output}/presales-workspace.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /Digital operations workspace/ })
    .click();
  await page.screenshot({
    path: `${output}/opportunity-before-analysis.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/",
    "/app",
    "/app/presales",
    "/app/exceptions",
    "/app/human-service",
    "/app/management",
    "/app/sources",
    "/app/system",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Loading workspace…")).toHaveCount(0);
    await noOverflow(page);
  }
  await page.goto("/app/presales");
  await expect(
    page.getByRole("button", { name: /Digital operations workspace/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("button", { name: "Close navigation", exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Exceptions", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Make the blockers visible." }),
  ).toBeVisible();
  await page.goto("/app/presales");
  await expect(
    page.getByRole("button", { name: /Digital operations workspace/ }),
  ).toBeVisible();
  await page.screenshot({
    path: `${output}/presales-mobile.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("create, upload, analyze, edit, approve and close ERP loop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app/presales");
  await page
    .getByRole("button", { name: "New opportunity", exact: true })
    .click();
  await page
    .getByLabel("Opportunity name")
    .fill("Browser acceptance " + Date.now());
  await page
    .getByLabel("Customer", { exact: true })
    .fill("Browser Demo Customer");
  await page
    .getByLabel("Owner", { exact: true })
    .fill("Browser Pre-Sales Reviewer");
  await page
    .getByLabel("Sales notes")
    .fill("Validate the complete workflow through the browser.");
  await page
    .getByRole("button", { name: "Create opportunity", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add source document" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add source document" }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "customer-brief.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "# Browser TOR\nBuild a React workspace and Python integration.\nAcceptance: signed test results.\nTimeline: phased discovery.\nIntegration: ERP REST API.\nBudget: approved commercial input still required.\n",
      ),
    });
  await page.getByRole("button", { name: "Add source", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Start analysis", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("tab", { name: "Proposal", exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await expect(
    page.getByRole("button", { name: "Review & approve pack" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Solution", exact: true }).click();
  await page.getByRole("button", { name: "Edit artifact" }).click();
  await page
    .getByLabel("Summary / reviewer annotation")
    .fill(
      "Reviewed solution for the customer. Pricing and delivery remain subject to separate confirmation.",
    );
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Solution", exact: true }).click();
  await expect(
    page.getByText(
      "Reviewed solution for the customer. Pricing and delivery remain subject to separate confirmation.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review & approve pack" }).click();
  await page
    .getByLabel("Review note")
    .fill(
      "All eleven artifact versions have been checked against source evidence.",
    );
  await page
    .getByLabel(
      "I have reviewed all 11 artifacts and their supporting sources.",
    )
    .check();
  await page.getByRole("button", { name: "Approve current versions" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Ready for Sales", exact: true })
    .click();
  await page
    .getByLabel("Decision / handoff note")
    .fill("Ready for the Sales discussion, with no commercial commitment.");
  await page.getByRole("button", { name: "Record outcome" }).click();
  await expect(
    page.getByText("Ready for a Sales discussion", { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await page.reload();
  await expect(
    page
      .locator(".detail-summary")
      .getByText("Ready For Sales", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Requirements", exact: true }).click();
  await page.screenshot({
    path: `${output}/reviewed-intelligence-pack.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.screenshot({
    path: `${output}/reviewed-pack-mobile.png`,
    fullPage: true,
  });
});

test("clarification outcome and evidence search", async ({ page }) => {
  await page.goto("/app/presales");
  await page
    .getByRole("button", { name: /Digital operations workspace/ })
    .click();
  await page
    .getByRole("button", { name: "Start analysis", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("tab", { name: "Requirements", exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await page.getByRole("button", { name: "Find evidence" }).click();
  await page.getByLabel("What are you looking for?").fill("ERP integration");
  await page
    .getByRole("button", { name: "Search evidence", exact: true })
    .click();
  await expect(page.locator(".evidence-results article")).not.toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Request clarification", exact: true })
    .click();
  await page
    .getByLabel("Decision / handoff note")
    .fill(
      "Sales to reconfirm the customer acceptance owner before proceeding.",
    );
  await page.getByRole("button", { name: "Record outcome" }).click();
  await expect(
    page.getByText("Clarification requested", { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await page.reload();
  await expect(
    page
      .locator(".detail-summary")
      .getByText("Clarification Required", { exact: true }),
  ).toBeVisible();
});
