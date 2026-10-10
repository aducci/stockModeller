// Slice 0.7 exit criterion (design/build-plan.md): edits show at once and survive a reload. Plus two people
// in one repository seeing each other's edits, and undo from the toast.
import { expect, test, type Browser, type Page } from "@playwright/test";

async function signIn(page: Page, userId = "dev@example.com") {
  await page.goto("/");
  await page.getByLabel("Workspace").fill("W-DEV");
  await page.getByLabel("Email").fill(userId);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Insurance Group EA" }).click();
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
}

const explorer = (page: Page) => page.getByRole("navigation", { name: "Explorer" });
const properties = (page: Page) => page.getByRole("complementary", { name: "Properties" });

/** The explorer row named exactly `name` (other rows, such as diagrams about it, may start with the same words). */
const exactRow = (page: Page, name: string) =>
  explorer(page).locator(".row:not(.member)", { hasText: new RegExp(`^\\W*${name}$`) });

async function selectInExplorer(page: Page, name: string) {
  await explorer(page).getByLabel("Filter the explorer").fill(name);
  await explorer(page).locator(".row", { hasText: name }).first().click();
  await expect(properties(page).getByLabel("Name")).toHaveValue(name);
}

async function rename(page: Page, from: string, to: string) {
  await selectInExplorer(page, from);
  await properties(page).getByLabel("Name").fill(to);
  await properties(page).getByLabel("Name").press("Enter");
}

async function newPage(browser: Browser, userId: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, userId);
  return page;
}

test("an edit shows at once, is saved, and survives a reload", async ({ page }) => {
  await signIn(page);
  await rename(page, "Claims Manager", "Claims Hub");

  // At once: the explorer and the properties panel show the new name before the server has answered.
  await explorer(page).getByLabel("Filter the explorer").fill("");
  await expect(explorer(page).locator(".row", { hasText: "Claims Hub" })).toBeVisible({ timeout: 200 });
  await expect(page.getByRole("status").filter({ hasText: "Rename Claims Manager to Claims Hub" })).toBeVisible();
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");

  await page.reload();
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
  await expect(explorer(page).locator(".row", { hasText: "Claims Hub" })).toBeVisible();
  // Only the object is renamed: its views keep their own names ("Claims Manager context").
  await expect(
    explorer(page)
      .locator(".row")
      .filter({ has: page.getByText("Claims Manager", { exact: true }) }),
  ).toHaveCount(0);
});

test("two people see each other's edits and presence", async ({ browser }) => {
  const dana = await newPage(browser, "dana@example.com");
  const lee = await newPage(browser, "lee@example.com");
  // Each sees the other. Not an exact count: the previous test's session can linger until its socket times out.
  await expect(dana.locator('.presence .avatar[title="lee@example.com"]')).toHaveCount(1);
  await expect(dana.locator('.presence .avatar[title="dana@example.com"]')).toHaveCount(1);
  await expect(lee.locator('.presence .avatar[title="dana@example.com"]')).toHaveCount(1);

  await rename(dana, "Legacy CRM", "Old CRM");
  await expect(explorer(lee).locator(".row", { hasText: "Old CRM" })).toBeVisible();

  // Lee sets a property; Dana's panel follows.
  await selectInExplorer(dana, "Old CRM");
  await selectInExplorer(lee, "Old CRM");
  await properties(lee).locator("#prop-lifecycle\\.status").selectOption("retired");
  await expect(properties(dana).locator("#prop-lifecycle\\.status")).toHaveValue("retired");
  await expect(dana.getByTestId("save-state")).toHaveText("All changes saved");
  await expect(lee.getByTestId("save-state")).toHaveText("All changes saved");
  await dana.context().close();
  await lee.context().close();
});

test("creates a folder and an object in it, and undoes from the toast", async ({ page }) => {
  await signIn(page);
  await explorer(page).getByRole("button", { name: "+ Folder" }).click();
  await explorer(page).getByLabel("New folder name").fill("Sandbox");
  await explorer(page).getByLabel("New folder name").press("Enter");
  await expect(explorer(page).locator(".row.selected", { hasText: "Sandbox" })).toBeVisible();

  await explorer(page).getByRole("button", { name: "+ Object" }).click();
  await explorer(page).getByLabel("Object type").selectOption({ label: "Application" });
  await explorer(page).getByLabel("New object name").fill("Ledger");
  await explorer(page).getByLabel("New object name").press("Enter");
  await expect(properties(page).getByLabel("Name")).toHaveValue("Ledger");

  const toast = page.getByRole("status").filter({ hasText: "Create Ledger" });
  await expect(toast.getByRole("button", { name: "Undo" })).toBeEnabled();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(explorer(page).locator(".row", { hasText: "Ledger" })).toHaveCount(0);
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
});

test("undoes and redoes with the keyboard and the Edit menu", async ({ page }) => {
  await signIn(page);
  await rename(page, "Payments Hub", "Payments Core");
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
  await explorer(page).getByLabel("Filter the explorer").fill("Payments");

  await exactRow(page, "Payments Core").click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(exactRow(page, "Payments Hub")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Undone: Rename" })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(exactRow(page, "Payments Core")).toBeVisible();

  await page.getByRole("menubar").getByRole("menuitem", { name: "Edit" }).click();
  await page.getByRole("menuitem", { name: /^Undo Rename/ }).click();
  await expect(exactRow(page, "Payments Hub")).toBeVisible();
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
});

test("offers an existing object when a new one is named the same, and selects it", async ({ page }) => {
  await signIn(page);
  await selectInExplorer(page, "Payments Hub");
  await explorer(page).getByRole("button", { name: "+ Object" }).click();
  await explorer(page).getByLabel("Object type").selectOption({ label: "Application" });
  const box = explorer(page).getByLabel("New object name");
  await box.fill("payments");
  const list = explorer(page).getByRole("listbox", { name: "Existing or new" });
  // A partial name lists the match (a SaaS application, so its type is shown) but still creates by default.
  await expect(list.getByRole("option").first()).toContainText("Payments Hub");
  await expect(list.getByRole("option").first()).toContainText("SaaS application");
  await expect(list.getByRole("option").last()).toHaveAttribute("aria-selected", "true");
  await box.press("ArrowDown");
  await expect(list.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await box.press("Enter");
  await expect(properties(page).getByLabel("Name")).toHaveValue("Payments Hub");
  await expect(page.getByRole("status").filter({ hasText: "Payments Hub already exists" })).toBeVisible();
  await expect(explorer(page).getByLabel("New object name")).toHaveCount(0);
});

test("refuses an edit that breaks a rule and says why", async ({ page }) => {
  await signIn(page);
  // Names are unique per type in the repository (at one abstraction): make two, then try to give one the other's name.
  // Both are new, so an earlier spec's change of abstraction elsewhere cannot make the names legitimately differ.
  await selectInExplorer(page, "Payments Hub");
  for (const name of ["Taken Name", "Spare Name"]) {
    await explorer(page).getByRole("button", { name: "+ Object" }).click();
    await explorer(page).getByLabel("Object type").selectOption({ label: "SaaS application" });
    await explorer(page).getByLabel("New object name").fill(name);
    await explorer(page).getByLabel("New object name").press("Enter");
    await expect(properties(page).getByLabel("Name")).toHaveValue(name);
  }
  await rename(page, "Spare Name", "Taken Name");
  await expect(page.getByRole("alert").filter({ hasText: "already exists" })).toBeVisible();
  await expect(properties(page).getByLabel("Name")).toHaveValue("Spare Name");
});

test("the View menu picks a light or dark theme, kept after a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await signIn(page);
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? "system");
  const choose = async (name: string) => {
    await page.getByRole("menubar").getByRole("menuitem", { name: "View", exact: true }).click();
    await page.getByRole("menuitem", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name }).click();
  };
  await choose("Dark");
  expect(await theme()).toBe("dark");
  await page.reload();
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
  expect(await theme()).toBe("dark");
  const pane = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--pane").trim());
  expect(await pane()).toBe("#161d26");

  await page.getByRole("menubar").getByRole("menuitem", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: "Theme" }).click();
  await expect(page.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitemradio", { name: "Match system" }).click();
  expect(await theme()).toBe("system");
  expect(await pane()).toBe("#fdfdfe");
});
