// Views in the app, slice U-1: the New diagram dialog grouped by kind, asking a document for its subject; "New ▸"
// on an element drawing a context around it; a view's properties saying what kind it is and what it is about.
// Every diagram it makes is deleted at the end.
import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Workspace").fill("W-DEV");
  await page.getByLabel("Email").fill("dev@example.com");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Insurance Group EA" }).click();
  await saved(page);
}

const saved = (page: Page) => expect(page.getByTestId("save-state")).toHaveText("All changes saved");
const explorer = (page: Page) => page.getByRole("navigation", { name: "Explorer" });
const row = (page: Page, name: string) =>
  explorer(page)
    .locator(".row")
    .filter({ has: page.getByText(name, { exact: true }) })
    .first();
const menuItem = (page: Page, name: string | RegExp) => page.getByRole("menuitem", { name, exact: true });
const properties = (page: Page) => page.getByRole("complementary", { name: "Properties" });
const dialog = (page: Page) => page.getByRole("dialog", { name: "New diagram" });

async function deleteDiagram(page: Page, name: string) {
  await explorer(page).getByLabel("Filter the explorer").fill(name);
  await row(page, name).click({ button: "right" });
  await menuItem(page, "Delete diagram").click();
  await saved(page);
  await explorer(page).getByLabel("Filter the explorer").fill("");
}

test("creates views of every kind from one dialog and from an element's New menu", async ({ page }) => {
  await signIn(page);

  // With nothing selected the dialog still opens, grouped by kind; a document waits for its subject.
  await explorer(page).getByRole("button", { name: "+ Diagram" }).click();
  await expect(dialog(page).locator("fieldset legend")).toContainText([
    "Diagrams",
    "Matrices",
    "Documents",
    "Sequences",
  ]);
  await dialog(page).getByRole("radio", { name: "High-level design" }).check();
  await expect(dialog(page).getByRole("button", { name: "Create" })).toBeDisabled();
  await expect(dialog(page)).toContainText("Choose what the document is about");
  await dialog(page).getByRole("combobox", { name: "About" }).fill("Legacy");
  await page.getByRole("option", { name: /^Legacy CRM/ }).click();
  await expect(dialog(page).getByLabel("Diagram name")).toHaveAttribute("placeholder", "Legacy CRM high-level design");
  await dialog(page).getByRole("button", { name: "Create" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Legacy CRM high-level design" })).toBeVisible();
  const view = properties(page).locator('[data-section="diagram:view"]');
  await expect(view).toContainText("Document");
  await expect(view).toContainText("High-level design");
  await expect(view.getByRole("button", { name: "Legacy CRM" })).toBeVisible();
  await saved(page);

  // New ▸ Context diagram on an element: it in the middle and what it is related to around it.
  await explorer(page).getByLabel("Filter the explorer").fill("Payments Hub");
  await row(page, "Payments Hub").click({ button: "right" });
  await menuItem(page, "New").hover();
  await menuItem(page, "Context diagram").click();
  await expect(page.getByRole("tab", { name: /Payments Hub context diagram/ })).toBeVisible();
  await expect(page.locator(".canvas .occ", { hasText: "Payments Hub" })).toHaveCount(1);
  await expect(page.locator(".canvas .occ", { hasText: "Claims Manager" })).toHaveCount(1);
  await expect(properties(page).locator('[data-section="diagram:view"]')).toContainText("Diagram");
  await saved(page);

  await deleteDiagram(page, "Payments Hub context diagram");
  await deleteDiagram(page, "Legacy CRM high-level design");
});

test("the example repository has a view of every kind to start from", async ({ page }) => {
  await signIn(page);
  const open = async (name: string) => {
    await explorer(page).getByLabel("Filter the explorer").fill(name);
    await row(page, name).dblclick();
  };

  await open("Claims Manager high-level design");
  await expect(page.getByRole("button", { name: /sections complete/ })).toHaveText("6 of 6 sections complete");
  await page
    .getByRole("region", { name: "Information flows", exact: true })
    .getByRole("button", { name: "Open the sequence with Payments API" })
    .click();
  await expect(page.getByRole("tab", { name: /Pay a claim/ })).toBeVisible();

  await open("Pay a claim");
  await page.getByLabel("Steps table").check();
  await expect(page.getByRole("table", { name: "Steps" }).locator("tbody tr")).toHaveCount(2);
  const view = properties(page).locator('[data-section="diagram:view"]');
  await expect(view).toContainText("Sequence");
  await expect(view.getByRole("button", { name: /Claims Manager high-level design/ })).toBeVisible();
  await expect(view.getByRole("button", { name: /Payments API integration specification/ })).toBeVisible();

  await open("Capability × application matrix");
  await expect(properties(page).locator('[data-section="diagram:view"]')).toContainText("Matrix");
  await explorer(page).getByLabel("Filter the explorer").fill("");
});
