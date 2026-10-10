// Drag and drop in the explorer (design/04-ux/workbench.md, "Drag and drop in the explorer"): reorder, move, refuse
// with a reason, group, and the Alt+drop type menu. Works on items it creates itself, so later specs see the seeded
// objects unchanged.
import { expect, test, type Page } from "@playwright/test";

const explorer = (page: Page) => page.getByRole("navigation", { name: "Explorer" });
const row = (page: Page, name: string) =>
  explorer(page).locator(".row:not(.member)", { hasText: new RegExp(`^\\W*${name}$`) });
const member = (page: Page, group: string, name: string) =>
  row(page, group).locator("xpath=..").locator(":scope > ul > li > .row.member", { hasText: name });
/** The labels of the rows directly under a folder or object, in order. */
const childLabels = (page: Page, parent: string) =>
  row(page, parent).locator("xpath=..").locator(":scope > ul > li > .row:not(.member) .label");
const menuItem = (page: Page, name: string | RegExp) => page.getByRole("menuitem", { name, exact: true });
const saved = (page: Page) => expect(page.getByTestId("save-state")).toHaveText("All changes saved");

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Workspace").fill("W-DEV");
  await page.getByLabel("Email").fill("dev@example.com");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Insurance Group EA" }).click();
  await saved(page);
}

async function create(page: Page, parent: string, what: "folder" | "object", name: string) {
  await row(page, parent).click({ button: "right" });
  await menuItem(page, "New").hover();
  await menuItem(page, what === "folder" ? "Folder" : "Object").click();
  const box = explorer(page).getByLabel(`New ${what} name`);
  await box.fill(name);
  await box.press("Enter");
  await expect(row(page, name)).toHaveCount(1);
}

/** Drops `from` on the top edge, the middle or the bottom edge of `to`. */
async function drag(page: Page, from: string, to: string, where: "before" | "into" | "after") {
  const target = row(page, to);
  const height = (await target.boundingBox())!.height;
  const y = where === "before" ? 2 : where === "after" ? height - 2 : height / 2;
  await row(page, from).dragTo(target, { targetPosition: { x: 40, y } });
}

test("reorders and moves items by dragging, refuses a folder inside itself, and keeps it all after a reload", async ({
  page,
}) => {
  await signIn(page);
  await create(page, "Applications", "folder", "DnD Lab");
  for (const name of ["Item One", "Item Two", "Item Three"]) await create(page, "DnD Lab", "object", name);
  await create(page, "DnD Lab", "folder", "Alpha");
  await create(page, "DnD Lab", "folder", "Beta");
  await expect(childLabels(page, "DnD Lab")).toHaveText(["Alpha", "Beta", "Item One", "Item Three", "Item Two"]);

  // Reorder: Item Two above Item One, then a folder between two objects.
  await drag(page, "Item Two", "Item One", "before");
  await saved(page);
  await expect(childLabels(page, "DnD Lab")).toHaveText(["Alpha", "Beta", "Item Two", "Item One", "Item Three"]);
  await drag(page, "Beta", "Item One", "after");
  await saved(page);
  await expect(childLabels(page, "DnD Lab")).toHaveText(["Alpha", "Item Two", "Item One", "Beta", "Item Three"]);

  // Move a folder into another, then try to move the outer one into it: refused, with the reason.
  await drag(page, "Beta", "Alpha", "into");
  await saved(page);
  await expect(childLabels(page, "Alpha")).toHaveText(["Beta"]);
  await drag(page, "Alpha", "Beta", "into");
  await expect(childLabels(page, "Alpha")).toHaveText(["Beta"]);

  await page.reload();
  await saved(page);
  await expect(childLabels(page, "DnD Lab")).toHaveText(["Alpha", "Item Two", "Item One", "Item Three"]);
  await row(page, "Alpha").click(); // folders three levels down start closed
  await expect(childLabels(page, "Alpha")).toHaveText(["Beta"]);

  // One Undo puts a drop back.
  await drag(page, "Item Three", "Item Two", "before");
  await saved(page);
  await expect(childLabels(page, "DnD Lab")).toHaveText(["Alpha", "Item Three", "Item Two", "Item One"]);
  const toast = page.getByRole("status").filter({ hasText: "Reorder Item Three" });
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(childLabels(page, "DnD Lab")).toHaveText(["Alpha", "Item Two", "Item One", "Item Three"]);
});

test("groups marked objects, adds one by dropping it on the group, and moves nothing", async ({ page }) => {
  await signIn(page);
  await row(page, "Item One").click();
  await row(page, "Item Two").click({ modifiers: ["ControlOrMeta"] });
  await row(page, "Item Two").click({ button: "right" });
  await menuItem(page, "Group 2 items…").click();
  await explorer(page).getByLabel("New group name").fill("Lab Group");
  await explorer(page).getByLabel("New group name").press("Enter");
  await saved(page);
  await expect(member(page, "Lab Group", "Item One")).toHaveCount(1);
  await expect(member(page, "Lab Group", "Item Two")).toHaveCount(1);

  await drag(page, "Item Three", "Lab Group", "into");
  await saved(page);
  await expect(member(page, "Lab Group", "Item Three")).toHaveCount(1);
  await expect(page.getByRole("status").filter({ hasText: "Add Item Three to Lab Group" })).toBeVisible();
  // Members stay where they are stored.
  for (const name of ["Item One", "Item Two", "Item Three"])
    await expect(childLabels(page, "DnD Lab").filter({ hasText: name })).toHaveCount(1);

  // Remove one from its member row.
  await member(page, "Lab Group", "Item Three").click({ button: "right" });
  await menuItem(page, "Remove from group").click();
  await saved(page);
  await expect(member(page, "Lab Group", "Item Three")).toHaveCount(0);
});

test("Alt+drop asks how an object relates, and contains it with the chosen type", async ({ page }) => {
  await signIn(page);
  await page.keyboard.down("Alt");
  await drag(page, "Item Two", "Item One", "into");
  await page.keyboard.up("Alt");
  const menu = page.getByRole("menu", { name: "Relationship type" });
  await expect(menu).toBeVisible();
  await menuItem(page, "Contain as").hover();
  await menuItem(page, "Contains").click();
  await saved(page);
  await expect(childLabels(page, "Item One")).toHaveText(["Item Two"]);
});

test("Ctrl+A marks every row the explorer shows, and Escape clears the marks", async ({ page }) => {
  await signIn(page);
  await explorer(page).getByLabel("Filter the explorer").fill("Item");
  await row(page, "Item One").click();
  await page.keyboard.press("ControlOrMeta+a");
  const shown = await explorer(page).locator(".row[data-id]:not(.member)").count();
  expect(shown).toBeGreaterThan(1);
  await expect(explorer(page).locator(".row.marked")).toHaveCount(shown);
  await page.keyboard.press("Escape");
  await expect(explorer(page).locator(".row.marked")).toHaveCount(0);
});
