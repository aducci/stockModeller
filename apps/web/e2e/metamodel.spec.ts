// Metamodel administration, slice A-1 (design/02-model/notation-and-metamodel-admin.md §10): the Metamodel menu, the
// connection matrix, rule sentences, try a connection, and publishing a new version that other sessions pick up.
// It only adds a rule, so the specs that run after it keep the rules they expect.
import { expect, test, type Browser, type Page } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

async function signIn(page: Page, userId = "dev@example.com") {
  await page.goto("/");
  await page.getByLabel("Workspace").fill("W-DEV");
  await page.getByLabel("Email").fill(userId);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Insurance Group EA" }).click();
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
}

async function openMetamodel(page: Page, item: string) {
  await page.getByRole("menubar").getByRole("menuitem", { name: "Metamodel", exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
  await expect(page.getByRole("tablist", { name: "Metamodel views" })).toBeVisible();
}

async function newPage(browser: Browser, userId: string) {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  await signIn(page, userId);
  return page;
}

const version = (page: Page) => page.locator(".mm-header .chip");

test("adds a rule in the connection matrix, reviews it and publishes it to everyone", async ({ browser }) => {
  const dana = await newPage(browser, "dana@example.com");
  const lee = await newPage(browser, "lee@example.com");
  await openMetamodel(dana, "Connection matrix");
  await openMetamodel(lee, "Types");
  const before = await version(dana).textContent();
  await expect(version(lee)).toHaveText(before!);

  // Process → Data object allows nothing yet; tick "accesses" for exactly that pair.
  const cell = dana.locator('.cell-button[data-source="process"][data-target="dataObject"]');
  await expect(cell).toHaveAttribute("aria-label", "Process to Data object: nothing allowed");
  await cell.click();
  const editor = dana.getByRole("dialog", { name: "Rules from Process to Data object" });
  await editor.getByRole("checkbox", { name: "accesses" }).check();
  await editor.getByRole("button", { name: "Done" }).click();
  await expect(cell).toHaveAttribute("aria-label", "Process to Data object: accesses");
  const draft = dana.getByRole("region", { name: "Unpublished changes" });
  await expect(draft).toContainText("1 change not published");

  // The same draft as a sentence, marked new.
  await dana.getByRole("tab", { name: "Rule sentences" }).click();
  const rule = dana.locator('[data-rule="accesses:process->dataObject"]');
  await expect(rule).toContainText("Process");
  await expect(rule).toContainText("new");

  // Review shows the rule and that nothing existing becomes unallowed; publishing bumps the version for both.
  await draft.getByRole("button", { name: "Review and publish…" }).click();
  const review = dana.getByRole("dialog", { name: "Publish the metamodel" });
  await expect(review).toContainText("Rules added (1)");
  await expect(review).toContainText("Process · accesses · Data object");
  await expect(review).toContainText("Every existing relationship is still allowed");
  await review.getByRole("button", { name: "Publish" }).click();
  await expect(dana.getByRole("status").filter({ hasText: /^Published metamodel/ })).toBeVisible();
  await expect(draft).toHaveCount(0);
  await expect(version(dana)).not.toHaveText(before!);
  const published = await version(dana).textContent();
  await expect(version(lee)).toHaveText(published!);
  await expect(rule).not.toContainText("new");

  // Try a connection now offers it.
  await dana.getByRole("tab", { name: "Try a connection" }).click();
  await dana.getByRole("combobox", { name: "From", exact: true }).selectOption({ label: "Process" });
  await dana.getByRole("combobox", { name: "To", exact: true }).selectOption({ label: "Data object" });
  await expect(dana.getByLabel("What a modeller gets")).toContainText("Process accesses Data object");
  await dana.context().close();
  await lee.context().close();
});

test("explains why two types cannot connect, and discards a draft", async ({ page }) => {
  await signIn(page);
  await openMetamodel(page, "Try a connection");
  await page.getByRole("combobox", { name: "From", exact: true }).selectOption({ label: "Server" });
  await page.getByRole("combobox", { name: "To", exact: true }).selectOption({ label: "Capability" });
  await expect(page.getByRole("status").filter({ hasText: "No rule connects Server to Capability." })).toBeVisible();

  await page.getByRole("tab", { name: "Rule sentences" }).click();
  await page.getByLabel("Source type").selectOption({ label: "Server" });
  await page.getByLabel("Relationship type").selectOption({ label: "supports" });
  await page.getByLabel("Target type").selectOption({ label: "Capability" });
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.locator('[data-rule="supports:server->capability"]')).toBeVisible();
  await page.getByRole("region", { name: "Unpublished changes" }).getByRole("button", { name: "Discard" }).click();
  await expect(page.locator('[data-rule="supports:server->capability"]')).toHaveCount(0);
});
