// The explorer's right-click menu and the top bar's File menu (design/04-ux/workbench.md, "Menus"). Works on
// items it creates itself: the seeded objects are left alone for the specs that run after this one.
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Workspace").fill("W-DEV");
  await page.getByLabel("Email").fill("dev@example.com");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Insurance Group EA" }).click();
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
}

const explorer = (page: Page) => page.getByRole("navigation", { name: "Explorer" });
const row = (page: Page, name: string) => explorer(page).locator(".row", { hasText: name }).first();
const menuItem = (page: Page, name: string | RegExp) => page.getByRole("menuitem", { name, exact: true });

test("the right-click menu creates, renames and deletes a folder", async ({ page }) => {
  await signIn(page);
  await row(page, "Applications").click({ button: "right" });
  await menuItem(page, "New").hover();
  await menuItem(page, "New folder").click();
  await explorer(page).getByLabel("New folder name").fill("Menu Test");
  await explorer(page).getByLabel("New folder name").press("Enter");
  await expect(row(page, "Menu Test")).toBeVisible();

  // An object in it: the folder cannot be deleted while it holds something, and the menu says why.
  await row(page, "Menu Test").click({ button: "right" });
  await menuItem(page, "New").hover();
  await menuItem(page, "New object").click();
  await explorer(page).getByLabel("New object name").fill("Menu Widget");
  await explorer(page).getByLabel("New object name").press("Enter");
  await expect(row(page, "Menu Widget")).toBeVisible();
  await row(page, "Menu Test").click({ button: "right" });
  const deleteFolder = menuItem(page, "Delete folder");
  await expect(deleteFolder).toHaveAttribute("aria-disabled", "true");
  await expect(deleteFolder).toHaveAttribute("title", "Not empty: holds 1 item");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  // Rename from the keyboard (F2), delete the object from the menu (through its dialog), then the folder.
  await row(page, "Menu Widget").click();
  await row(page, "Menu Widget").press("F2");
  await explorer(page).getByLabel("Rename Menu Widget").fill("Menu Gadget");
  await explorer(page).getByLabel("Rename Menu Widget").press("Enter");
  await expect(row(page, "Menu Gadget")).toBeVisible();
  await row(page, "Menu Gadget").click({ button: "right" });
  await menuItem(page, /^Delete object/).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete object" }).click();
  await expect(explorer(page).locator(".row", { hasText: "Menu Gadget" })).toHaveCount(0);

  await row(page, "Menu Test").click({ button: "right" });
  await menuItem(page, "Delete folder").click();
  await expect(explorer(page).locator(".row", { hasText: "Menu Test" })).toHaveCount(0);
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");

  await page.reload();
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
  await expect(row(page, "Applications")).toBeVisible();
  await expect(explorer(page).locator(".row", { hasText: "Menu Test" })).toHaveCount(0);
});

test("the File menu creates a diagram, renames it and closes its tab", async ({ page }) => {
  await signIn(page);
  const file = page.getByRole("menubar").getByRole("menuitem", { name: "File" });

  // Nothing selected: only a folder can be made, and the menu says why the rest cannot.
  await file.click();
  await expect(menuItem(page, "New diagram")).toHaveAttribute("aria-disabled", "true");
  await expect(menuItem(page, "Close tab")).toHaveAttribute("title", "No tab is open");
  await page.keyboard.press("Escape");

  await row(page, "Diagrams").click();
  await file.click();
  await menuItem(page, "New diagram").click();
  await explorer(page).getByLabel("New diagram name").fill("Menu Landscape");
  await explorer(page).getByLabel("New diagram name").press("Enter");
  await expect(page.getByRole("tab", { name: /Menu Landscape/ })).toBeVisible();

  await file.click();
  await menuItem(page, "Rename").click();
  await explorer(page).getByLabel("Rename Menu Landscape").fill("Menu Map");
  await explorer(page).getByLabel("Rename Menu Landscape").press("Enter");
  await expect(page.getByRole("tab", { name: /Menu Map/ })).toBeVisible();

  // Keyboard: ↓ opens the menu, arrows move, Enter runs.
  await file.focus();
  await page.keyboard.press("ArrowDown");
  await expect(menuItem(page, "New folder")).toBeFocused();
  await page.keyboard.press("Escape");
  await file.click();
  await menuItem(page, "Close all tabs").click();
  await expect(page.getByRole("tab")).toHaveCount(0);

  await row(page, "Menu Map").click();
  await file.click();
  await menuItem(page, "Delete").click();
  await expect(explorer(page).locator(".row", { hasText: "Menu Map" })).toHaveCount(0);
});
