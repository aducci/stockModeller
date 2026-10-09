// What a diagram is about (DOC-1, design/02-model/views-and-design-artifacts.md §12): an element's documentation
// links the documents and diagrams about it, the explorer lists them under it, and its symbols open them.
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
const row = (page: Page, name: string) => explorer(page).locator(".row", { hasText: name }).first();
const properties = (page: Page) => page.getByRole("complementary", { name: "Properties" });
const menuItem = (page: Page, name: string | RegExp) => page.getByRole("menuitem", { name, exact: true });

test("an element's documentation links what is about it, and its symbols open its diagram", async ({ page }) => {
  await signIn(page);
  await explorer(page).getByLabel("Filter the explorer").fill("Claims Manager");
  await row(page, "Claims Manager").click();
  const docs = properties(page).getByRole("group", { name: "Documentation" });
  await expect(docs.getByRole("button", { name: "Claims Manager high-level design", exact: true })).toBeVisible();
  await expect(docs.locator(".link-value")).toHaveText("wiki.example.com/claims-manager");
  await docs.getByRole("button", { name: "Claims Manager high-level design", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Claims Manager high-level design" })).toBeVisible();

  // Every symbol of Claims Manager opens the diagram about it, here from the landscape.
  await explorer(page).getByLabel("Filter the explorer").fill("");
  await row(page, "Claims landscape").dblclick();
  // Other tests draw over the landscape, so the symbol's drill marker is clicked rather than the symbol itself.
  await page.getByRole("link", { name: "Open the child diagram of Claims Manager" }).first().click();
  // Other tests may have made more views about Claims Manager; whichever opens is one of them.
  await expect(page.getByRole("tablist", { name: "Open items" }).locator('[aria-selected="true"]')).toContainText(
    "Claims Manager",
  );
});

test("a new view about an element is linked from it, and deleting the view removes the link", async ({ page }) => {
  await signIn(page);
  await explorer(page).getByLabel("Filter the explorer").fill("Legacy CRM");
  await row(page, "Legacy CRM").click({ button: "right" });
  await menuItem(page, "New").hover();
  await menuItem(page, "High-level design").click();
  await expect(page.getByRole("heading", { name: "Legacy CRM high-level design" })).toBeVisible();
  await saved(page);

  await row(page, "Legacy CRM").click();
  const docs = properties(page).getByRole("group", { name: "Documentation" });
  await expect(docs.getByRole("button", { name: "Legacy CRM high-level design", exact: true })).toBeVisible();

  await explorer(page).getByLabel("Filter the explorer").fill("Legacy CRM high-level design");
  await row(page, "Legacy CRM high-level design").click({ button: "right" });
  await menuItem(page, "Delete diagram").click();
  await saved(page);
  await explorer(page).getByLabel("Filter the explorer").fill("Legacy CRM");
  await row(page, "Legacy CRM").click();
  await expect(docs.getByRole("button", { name: "Legacy CRM high-level design", exact: true })).toHaveCount(0);
});

// Decomposition (DOC-1b): the value chain's L0 to L3 is one diagram type, drilled into through each process.
test("a value chain drills into a process, and what is drawn there becomes its part", async ({ page }) => {
  await signIn(page);
  await explorer(page).getByLabel("Filter the explorer").fill("Manage Claims value chain");
  await row(page, "Manage Claims value chain").dblclick();
  const canvas = page.getByRole("application", { name: "Diagram Manage Claims value chain" });
  // Recover Costs has no decomposition yet: double-clicking it offers one.
  await canvas.locator('.occ[data-name="Recover Costs"]').dblclick();
  await menuItem(page, "New value chain for Recover Costs").click();
  const child = page.getByRole("application", { name: "Diagram Recover Costs value chain" });
  await expect(child).toBeVisible();
  const crumbs = page.getByRole("navigation", { name: "Decomposition" });
  await expect(crumbs).toHaveText("Manage Claims›Recover Costs");

  // Drawing a process on it makes the process a part of Recover Costs.
  await page
    .getByRole("toolbar", { name: "Palette" })
    .locator(".palette-item", { hasText: /^Process$/ })
    .click();
  await child.getByLabel(/^Name of the new/).fill("Bill Insurer");
  await child.getByLabel(/^Name of the new/).press("Enter");
  await saved(page);
  const toasts = page.locator(".toasts");
  await expect(toasts).toContainText("Create Bill Insurer in Recover Costs");

  // Taking it off the diagram offers to take it out of Recover Costs too.
  await child.locator('.occ[data-name="Bill Insurer"]').click();
  await child.press("Delete");
  await toasts.getByRole("button", { name: "Also remove from Recover Costs" }).click();
  await saved(page);
  await expect(toasts).toContainText("Remove Bill Insurer from Recover Costs");

  // Back up through the breadcrumb.
  await crumbs.getByRole("button", { name: "Manage Claims" }).click();
  await expect(canvas).toBeVisible();
});
