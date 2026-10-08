// Starting over (storage §7): a repository with an empty metamodel, object, relationship and diagram types made
// from scratch, published and drawn with; the metamodel exported, a second repository started from the file, and
// that repository deleted. It never touches the example repository.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

const saved = (page: Page) => expect(page.getByTestId("save-state")).toHaveText("All changes saved");
const explorer = (page: Page) => page.getByRole("navigation", { name: "Explorer" });
const canvas = (page: Page) => page.getByRole("application", { name: "Diagram Team map" });
const symbol = (page: Page, name: string) => canvas(page).locator(`.occ[data-name="${name}"]`);
const newRepository = (page: Page) => page.getByRole("form", { name: "New repository" });

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Workspace").fill("W-DEV");
  await page.getByLabel("Email").fill("dev@example.com");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Repositories" })).toBeVisible();
}

async function openMetamodel(page: Page, item: string) {
  await page.getByRole("menubar").getByRole("menuitem", { name: "Metamodel", exact: true }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
  await expect(page.getByRole("tablist", { name: "Metamodel views" })).toBeVisible();
}

async function newType(page: Page, button: string, name: string) {
  await page.getByRole("button", { name: button }).click();
  await page.getByLabel(`Name of the ${button.replace(/^New /, "")}`).fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
}

async function addFromPalette(page: Page, type: string, name: string, x: number, y: number) {
  await page
    .getByRole("toolbar", { name: "Palette" })
    .locator(".palette-item", { hasText: new RegExp(`^${type}$`) })
    .dragTo(canvas(page), { targetPosition: { x, y } });
  const box = canvas(page).getByLabel(/^Name of the new/);
  await box.fill(name);
  await box.press("Enter");
  await expect(symbol(page, name)).toHaveCount(1);
}

test("builds a metamodel from scratch, draws with it, and carries it to a new repository", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "New repository…" }).click();
  await newRepository(page).getByLabel("Name").fill("Team model");
  await newRepository(page)
    .getByRole("radio", { name: /An empty metamodel/ })
    .check();
  await newRepository(page).getByRole("button", { name: "Create" }).click();
  await saved(page);

  // Two object types, one a kind of the other, and a relationship type that reads both ways.
  await openMetamodel(page, "Types");
  await newType(page, "New object type", "Team");
  await newType(page, "New object type", "System");
  const panel = page.getByRole("complementary", { name: "Properties of System" });
  await panel.getByLabel("Category").selectOption("component");
  await newType(page, "New relationship type", "Owns");
  const owns = page.getByRole("complementary", { name: "Properties of Owns" });
  await owns.getByLabel("Reads back").fill("is owned by");
  await expect(owns).toContainText("A owns B; B is owned by A.");

  // A rule lets a team own a system, and a blank diagram type shows both.
  await page.getByRole("tab", { name: "Connection matrix" }).click();
  await page.locator('.cell-button[data-source="team"][data-target="system"]').click();
  const rules = page.getByRole("dialog", { name: "Rules from Team to System" });
  await rules.getByRole("checkbox", { name: "owns" }).check();
  await rules.getByRole("button", { name: "Done" }).click();
  await page.getByRole("tab", { name: "Diagram types" }).click();
  await newType(page, "New diagram type", "Team map");
  const map = page.getByRole("region", { name: "Diagram type Team map" });
  await map.getByRole("checkbox", { name: "System" }).check();

  await page
    .getByRole("region", { name: "Unpublished changes" })
    .getByRole("button", { name: "Review and publish…" })
    .click();
  const review = page.getByRole("dialog", { name: "Publish the metamodel" });
  await expect(review).toContainText("Object types added (2)");
  await expect(review).toContainText("Relationship types added (1)");
  await expect(review).toContainText("Diagram types added (1)");
  await review.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Published metamodel/ })).toBeVisible();

  // The first diagram of an empty repository makes its folder; the palette offers the new types.
  await explorer(page).getByRole("button", { name: "+ Diagram" }).click();
  const dialog = page.getByRole("dialog", { name: "New diagram" });
  await dialog.getByRole("radio", { name: "Team map" }).check();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(canvas(page)).toBeVisible();
  await addFromPalette(page, "System", "Billing", 400, 120);
  await addFromPalette(page, "Team", "Payments squad", 120, 120);
  const handle = canvas(page).getByLabel("Connect");
  const from = (await handle.boundingBox())!;
  const to = (await symbol(page, "Billing").locator("rect").first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await canvas(page).getByRole("menu", { name: "Relationship type" }).getByRole("menuitem", { name: "owns" }).click();
  await expect(canvas(page).locator('.line[data-relationship="owns"]')).toHaveCount(1);
  await saved(page);

  // Export the metamodel, start a second repository from the file, then delete that one.
  await openMetamodel(page, "Types");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const file = await (await download).path();
  expect((await download).suggestedFilename()).toMatch(/\.metamodel\.json$/);
  const exported = JSON.parse(await readFile(file, "utf8")) as { package: { objectTypes: { key: string }[] } };
  expect(exported.package.objectTypes.map((t) => t.key).sort()).toEqual(["system", "team"]);

  await page.getByRole("menubar").getByRole("menuitem", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Switch repository…" }).click();
  await page.getByRole("button", { name: "New repository…" }).click();
  await newRepository(page).getByLabel("Name").fill("Team model copy");
  await newRepository(page)
    .getByRole("radio", { name: /An exported metamodel file/ })
    .check();
  await newRepository(page).getByLabel("Choose a metamodel file").setInputFiles(file);
  await newRepository(page).getByRole("button", { name: "Create" }).click();
  await saved(page);
  await openMetamodel(page, "Types");
  await expect(page.getByRole("table", { name: "Object types" })).toContainText("Team");
  await expect(page.getByRole("table", { name: "Relationship types" })).toContainText("Owns");
  await expect(explorer(page).locator(".row")).toHaveCount(0);

  await page.getByRole("menubar").getByRole("menuitem", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Switch repository…" }).click();
  // The row's button is named "Delete…", so "Open" buttons keep repository names to themselves.
  await page
    .getByRole("list", { name: "Repositories" })
    .getByRole("listitem")
    .filter({ hasText: "Team model copy" })
    .getByRole("button", { name: "Delete…" })
    .click();
  const confirm = page.getByRole("dialog", { name: "Delete Team model copy" });
  await expect(confirm.getByRole("button", { name: "Delete repository" })).toBeDisabled();
  await confirm.getByLabel("Repository name").fill("Team model copy");
  await confirm.getByRole("button", { name: "Delete repository" }).click();
  await expect(page.getByRole("list", { name: "Repositories" })).not.toContainText("Team model copy");
  await expect(page.getByRole("list", { name: "Repositories" })).toContainText("Team model");
});
