// The workbench tools from the October feedback round (design/04-ux/workbench.md): reordering explorer rows from
// the keyboard, the object viewer, minimising the side panel, child diagrams and a relationship type's rules.
// Runs last: it adds a folder and a diagram that earlier specs do not expect.
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

const explorer = (page: Page) => page.getByRole("navigation", { name: "Explorer" });
const row = (page: Page, name: string) =>
  explorer(page).locator(".row:not(.member)", { hasText: new RegExp(`^\\W*${name}$`) });
const childLabels = (page: Page, parent: string) =>
  row(page, parent).locator("xpath=..").locator(":scope > ul > li > .row:not(.member) .label");
const menuItem = (page: Page, name: string | RegExp) => page.getByRole("menuitem", { name, exact: true });
const saved = (page: Page) => expect(page.getByTestId("save-state")).toHaveText("All changes saved");
const canvas = (page: Page) => page.getByRole("application", { name: "Diagram Claims landscape" });
const activeTab = (page: Page) => page.getByRole("tablist", { name: "Open items" }).locator(".tab.active");

test("the object viewer adds, renames and deletes a folder's objects, and Ctrl+↓ reorders rows", async ({ page }) => {
  await signIn(page);
  await row(page, "Applications").click({ button: "right" });
  await menuItem(page, "New").hover();
  await menuItem(page, "Folder").click();
  await explorer(page).getByLabel("New folder name").fill("Viewer Lab");
  await explorer(page).getByLabel("New folder name").press("Enter");
  await expect(row(page, "Viewer Lab")).toHaveCount(1);

  await row(page, "Viewer Lab").click({ button: "right" });
  await menuItem(page, "Object viewer").click();
  const viewer = page.locator(".object-viewer");
  await expect(activeTab(page)).toContainText("Viewer Lab objects");
  await expect(viewer.getByLabel("Add to", { exact: true })).toHaveText("Add to Viewer Lab");
  await viewer.getByLabel("New object type").selectOption({ label: "Process" });
  for (const name of ["Alpha step", "Beta step"]) {
    await viewer.getByLabel("New object name").fill(name);
    await viewer.getByLabel("New object name").press("Enter");
  }
  const rows = viewer.getByRole("table", { name: "Objects" }).locator("tbody tr");
  await expect(rows).toHaveCount(2);
  // No property columns until some are picked; a new object starts at its type's abstraction.
  await expect(viewer.getByLabel("Abstraction of Alpha step")).toHaveCount(0);
  await viewer.locator(".ov-columns summary").click();
  await viewer.getByRole("group", { name: "Property columns" }).getByLabel("Abstraction").check();
  await expect(viewer.getByLabel("Abstraction of Alpha step")).toHaveValue("conceptual");
  await viewer.locator(".ov-columns summary").click();
  await viewer.getByLabel("Name of Alpha step").fill("Alpha one");
  await viewer.getByLabel("Name of Alpha step").press("Enter");
  await saved(page);
  await expect(childLabels(page, "Viewer Lab")).toHaveText(["Alpha one", "Beta step"]);

  // Ctrl+↓ moves the row below its sibling and keeps the focus on it.
  await row(page, "Alpha one").click();
  await row(page, "Alpha one").press("Control+ArrowDown");
  await expect(childLabels(page, "Viewer Lab")).toHaveText(["Beta step", "Alpha one"]);
  await expect(row(page, "Alpha one")).toBeFocused();
  await saved(page);

  await viewer.getByLabel("Select Beta step").check();
  await viewer.getByRole("button", { name: "Delete selected (1)" }).click();
  await expect(rows).toHaveCount(1);
  await saved(page);
  await page.reload();
  await saved(page);
  await expect(childLabels(page, "Viewer Lab")).toHaveText(["Alpha one"]);
});

test("the object viewer shows folders and contents as a tree, and quick add goes into the selected row", async ({
  page,
}) => {
  await signIn(page);
  await row(page, "Viewer Lab").click({ button: "right" });
  await menuItem(page, "New").hover();
  await menuItem(page, "Folder").click();
  await explorer(page).getByLabel("New folder name").fill("Sub lab");
  await explorer(page).getByLabel("New folder name").press("Enter");
  await saved(page);
  await row(page, "Viewer Lab").click({ button: "right" });
  await menuItem(page, "Object viewer").click();
  const viewer = page.locator(".object-viewer");
  const tr = (name: string) => viewer.locator(`tbody tr[data-name="${name}"]`);
  await expect(tr("Sub lab")).toHaveAttribute("data-kind", "folder");

  // + on an object: the new object goes inside it, offered only what its containment rules allow.
  await tr("Alpha one").getByRole("button", { name: "Add inside Alpha one" }).click();
  await expect(viewer.getByLabel("Add to", { exact: true })).toContainText("Add inside Alpha one");
  await expect(viewer.getByLabel("New object name")).toBeFocused();
  const type = viewer.getByLabel("New object type");
  await expect(type.locator("option")).not.toHaveCount(0);
  await expect(type.locator("option", { hasText: "Location" })).toHaveCount(0);
  await type.selectOption({ label: "Process step" });
  await viewer.getByLabel("New object name").fill("Check form");
  await viewer.getByLabel("New object name").press("Enter");
  await expect(tr("Check form")).toHaveCount(1);
  await expect(tr("Alpha one").getByRole("button", { name: "Close Alpha one" })).toBeVisible();
  await saved(page);

  // Clicking a folder row makes it the target.
  await tr("Sub lab").locator(".ov-type").click();
  await expect(viewer.getByLabel("Add to", { exact: true })).toContainText("Add to Sub lab");
  await viewer.getByLabel("New object type").selectOption({ label: "Process" });
  await viewer.getByLabel("New object name").fill("Gamma");
  await viewer.getByLabel("New object name").press("Enter");
  await saved(page);
  await viewer.getByLabel("Filter objects").fill("Gamma");
  await expect(tr("Gamma").locator("td").nth(3)).toHaveText("Sub lab");
  await viewer.getByLabel("Filter objects").fill("");

  await page.reload();
  await saved(page);
  await expect(childLabels(page, "Alpha one")).toHaveText(["Check form"]);
});

test("the side panel minimises to a rail and comes back", async ({ page }) => {
  await signIn(page);
  const properties = page.getByRole("complementary", { name: "Properties" });
  await expect(properties).toBeVisible();
  await page.getByRole("button", { name: "Minimise the side panel" }).click();
  await expect(properties).toHaveCount(0);
  await page.getByRole("button", { name: "Show Properties" }).click();
  await expect(properties).toBeVisible();
});

test("a symbol gets a child diagram, shows the marker, and double-click drills down", async ({ page }) => {
  await signIn(page);
  await explorer(page).getByLabel("Filter the explorer").fill("Claims landscape");
  await explorer(page).locator(".row", { hasText: "Claims landscape" }).dblclick();
  await explorer(page).getByLabel("Filter the explorer").fill("");
  const symbol = canvas(page).locator(".occ").first();
  const name = (await symbol.getAttribute("data-name"))!;

  await symbol.click({ button: "right" });
  await menuItem(page, "Child diagram").hover();
  await page.getByRole("menuitem", { name: /^New / }).first().click();
  await saved(page);
  await expect(activeTab(page)).toContainText(name);
  const child = (await activeTab(page).textContent())!.replace("×", "").trim();

  await page.getByRole("tab", { name: /Claims landscape/ }).click();
  await expect(symbol.locator(".drill")).toHaveCount(1);
  await symbol.dblclick();
  await expect(activeTab(page)).toContainText(child);

  await page.getByRole("tab", { name: /Claims landscape/ }).click();
  await symbol.click({ button: "right" });
  await menuItem(page, "Child diagram").hover();
  await menuItem(page, "Unlink child diagram").click();
  await saved(page);
  // The new child is about the element (DOC-1), so the symbol still opens it, now as the element's diagram.
  await expect(symbol.locator(".drill title")).toContainText(`About it: ${child}`);
});

test("a relationship type's rules are edited in its panel, and a matrix cell can be cancelled", async ({ page }) => {
  await signIn(page);
  await page.getByRole("menubar").getByRole("menuitem", { name: "Metamodel", exact: true }).click();
  await menuItem(page, "Connection matrix").click();
  const cell = page.locator('.cell-button[data-source="location"][data-target="location"]');
  const before = (await cell.getAttribute("aria-label"))!;
  await cell.click();
  const editor = page.getByRole("dialog", { name: "Rules from Location to Location" });
  await editor.locator('input[type="checkbox"]:not(:checked):not(:disabled)').first().check();
  await expect(cell).not.toHaveAttribute("aria-label", before);
  await editor.getByRole("button", { name: "Cancel" }).click();
  await expect(cell).toHaveAttribute("aria-label", before);

  await page.getByRole("tablist", { name: "Metamodel views" }).getByRole("tab", { name: "Types", exact: true }).click();
  await page.getByRole("table", { name: "Relationship types" }).locator("tbody tr").first().click();
  const rules = page.getByRole("region", { name: "Rules" });
  const count = await rules.locator("li").count();
  await rules.getByLabel("Rule from", { exact: true }).selectOption({ label: "Location" });
  await rules.getByLabel("Rule to", { exact: true }).selectOption({ label: "Location" });
  await rules.getByRole("button", { name: "Add rule" }).click();
  await expect(rules.locator("li")).toHaveCount(count + 1);
  await expect(page.getByRole("region", { name: "Unpublished changes" })).toContainText("1 change not published");
  await rules.getByRole("button", { name: "Remove the rule from Location to Location" }).click();
  await expect(rules.locator("li")).toHaveCount(count);
  await expect(page.getByRole("region", { name: "Unpublished changes" })).toHaveCount(0);

  // Abstraction and abstract explain themselves.
  await page.getByRole("table", { name: "Object types" }).locator("tbody tr").first().click();
  await page.getByRole("button", { name: "About abstraction" }).click();
  await expect(page.getByRole("note")).toContainText("Conceptual");
});
