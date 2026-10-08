// Matrix views, slice V-1 (design/02-model/views-and-design-artifacts.md §4): a new matrix from the Essentials type,
// a relationship created and deleted from a cell, the definition edited from the toolbar, and all of it after a reload.
// It deletes what it creates, so the specs that run after it see the seeded relationships unchanged.
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
const cell = (page: Page, row: string, column: string) =>
  page.locator(`.cell-button[data-row="${row}"][data-column="${column}"]`);

test("creates a matrix, adds and removes a relationship from a cell, and keeps the view's settings", async ({
  page,
}) => {
  await signIn(page);
  await explorer(page).locator(".row", { hasText: "Diagrams" }).first().click();
  await page.getByRole("menubar").getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "New diagram", exact: true }).click();
  await explorer(page).getByLabel("Diagram type").selectOption({ label: "Capability × application matrix" });
  await explorer(page).getByLabel("New diagram name").fill("Capability coverage");
  await explorer(page).getByLabel("New diagram name").press("Enter");
  const grid = page.getByRole("table", { name: "Capability coverage" });
  await expect(grid).toBeVisible();

  // Capabilities nest under their container; the seeded realisations are filled.
  const rows = grid.locator("tbody tr:not(.totals) th");
  // The third capability's name is left open: an earlier spec renames it.
  await expect(rows).toHaveText(["Claims Management", "Claim Intake", /^Claim /]);
  await expect(cell(page, "O-CAP-2", "O-APP-1")).toHaveAttribute(
    "aria-label",
    "Claim Intake and Claims Manager: realizes",
  );

  // An empty cell creates the one allowed relationship; Undo is in the toast.
  const empty = cell(page, "O-CAP-2", "O-APP-2");
  await expect(empty).toHaveAttribute("aria-label", "Claim Intake and Legacy CRM: add realizes");
  await empty.click();
  await expect(empty).toHaveAttribute("aria-label", "Claim Intake and Legacy CRM: realizes");
  await expect(page.getByRole("status").filter({ hasText: "Legacy CRM realizes Claim Intake" })).toBeVisible();
  await saved(page);

  // Hide empty is part of the view: it survives a reload, and so does the new relationship.
  await page.getByLabel("Hide empty").check();
  await saved(page);
  await page.reload();
  // The app may reopen the repository by itself, or show the repository list first.
  const repository = page.getByRole("button", { name: "Insurance Group EA", exact: true });
  await expect(page.getByTestId("save-state").or(repository)).toBeVisible();
  if (await repository.isVisible()) await repository.click();
  await saved(page);
  await explorer(page).getByLabel("Filter the explorer").fill("Capability coverage");
  await explorer(page).locator(".row", { hasText: "Capability coverage" }).dblclick();
  await expect(page.getByLabel("Hide empty")).toBeChecked();
  await expect(cell(page, "O-CAP-2", "O-APP-2")).toHaveAttribute("aria-label", "Claim Intake and Legacy CRM: realizes");

  // A filled cell lists its relationships; deleting one empties the cell.
  await cell(page, "O-CAP-2", "O-APP-2").click();
  const menu = page.getByRole("dialog");
  await expect(menu).toContainText("Legacy CRM realizes Claim Intake");
  await menu.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator('.cell-button[data-column="O-APP-2"]')).toHaveCount(0); // hidden: Legacy CRM is empty
  await page.getByLabel("Hide empty").uncheck();
  await expect(cell(page, "O-CAP-2", "O-APP-2")).toHaveAttribute(
    "aria-label",
    "Claim Intake and Legacy CRM: add realizes",
  );
  await saved(page);
});
