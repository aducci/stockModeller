// Slice 0.8 (design/build-plan.md): the diagram editor v0, and its exit criterion, validation scenario 4: one
// user renames an object while another moves its occurrence, and both changes survive.
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

const explorer = (page: Page) => page.getByRole("navigation", { name: "Explorer" });
const properties = (page: Page) => page.getByRole("complementary", { name: "Properties" });
const relations = (page: Page) => page.getByRole("complementary", { name: "Relations" });
const canvas = (page: Page) => page.getByRole("application", { name: "Diagram Claims landscape" });
const symbol = (page: Page, name: string) => canvas(page).locator(`.occ[data-name="${name}"]`);
const saved = (page: Page) => expect(page.getByTestId("save-state")).toHaveText("All changes saved");

async function openDiagram(page: Page) {
  await explorer(page).getByLabel("Filter the explorer").fill("Claims landscape");
  await explorer(page).locator(".row", { hasText: "Claims landscape" }).dblclick();
  await explorer(page).getByLabel("Filter the explorer").fill("");
  await expect(canvas(page)).toBeVisible();
}

/** The diagram position of a symbol's top-left corner. */
async function position(page: Page, name: string) {
  const rect = symbol(page, name).locator("rect").first();
  return { x: Number(await rect.getAttribute("x")), y: Number(await rect.getAttribute("y")) };
}

async function centre(page: Page, name: string) {
  const box = (await symbol(page, name).locator("rect").first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A point near a symbol's bottom-left corner: inside it, and clear of the smaller symbols drawn over its middle. */
async function corner(page: Page, name: string) {
  const box = (await symbol(page, name).locator("rect").first().boundingBox())!;
  return { x: box.x + 10, y: box.y + box.height - 10 };
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

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

async function newPage(browser: Browser, userId: string) {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  await signIn(page, userId);
  await openDiagram(page);
  return page;
}

test("adds a new object from the palette, and Escape cancels it", async ({ page }) => {
  await signIn(page);
  await openDiagram(page);
  await addFromPalette(page, "Application", "Fraud Check", 620, 60);
  // A new object goes to its type's default folder, and is selected.
  await expect(properties(page).getByLabel("Name")).toHaveValue("Fraud Check");
  await expect(properties(page).locator(".breadcrumb")).toHaveText("📁 Applications");
  await saved(page);

  // Escape with the name box open creates nothing.
  const before = await canvas(page).locator(".occ").count();
  await page
    .getByRole("toolbar", { name: "Palette" })
    .locator(".palette-item", { hasText: /^Capability$/ })
    .dragTo(canvas(page), { targetPosition: { x: 620, y: 200 } });
  await canvas(page)
    .getByLabel(/^Name of the new/)
    .press("Escape");
  await expect(canvas(page).getByLabel(/^Name of the new/)).toHaveCount(0);
  await expect(canvas(page).locator(".occ")).toHaveCount(before);
  await saved(page);
});

test("adds an existing object again, and marks the repeat", async ({ page }) => {
  await signIn(page);
  await openDiagram(page);
  await expect(symbol(page, "Claim Intake")).toHaveCount(1);
  await explorer(page).getByLabel("Filter the explorer").fill("Claim Intake");
  await explorer(page)
    .locator(".row", { hasText: "Claim Intake" })
    .dragTo(canvas(page), { targetPosition: { x: 620, y: 300 } });
  await expect(symbol(page, "Claim Intake")).toHaveCount(2);
  await expect(symbol(page, "Claim Intake").first().locator(".repeat")).toHaveText("×2");
  // Still one object.
  await expect(explorer(page).locator(".row", { hasText: "Claim Intake" })).toHaveCount(1);
  await saved(page);
});

test("naming a new symbol after an existing object reuses it instead of making a copy", async ({ page }) => {
  await signIn(page);
  await openDiagram(page);
  await expect(symbol(page, "Claim Intake").first()).toBeVisible();
  const before = await symbol(page, "Claim Intake").count();
  await page
    .getByRole("toolbar", { name: "Palette" })
    .locator(".palette-item", { hasText: /^Capability$/ })
    .dragTo(canvas(page), { targetPosition: { x: 620, y: 360 } });
  const box = canvas(page).getByLabel(/^Name of the new/);
  await box.fill("claim intake");
  // The existing capability is offered first and highlighted; creating a copy is the last option.
  const options = canvas(page).getByRole("listbox", { name: "Existing or new" }).getByRole("option");
  await expect(options.first()).toContainText("Claim Intake");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await expect(options.last()).toContainText("already exists");
  await box.press("Enter");
  await expect(symbol(page, "Claim Intake")).toHaveCount(before + 1);
  await expect(explorer(page).locator(".row", { hasText: "Claim Intake" })).toHaveCount(1);
  await saved(page);
});

test("connects two symbols with a relationship type the rules allow", async ({ page }) => {
  await signIn(page);
  await openDiagram(page);
  await addFromPalette(page, "Application", "Rating Engine", 100, 440);
  const handle = canvas(page).getByLabel("Connect");
  const from = (await handle.boundingBox())!;
  await drag(page, { x: from.x + from.width / 2, y: from.y + from.height / 2 }, await centre(page, "Payments Hub"));

  const menu = canvas(page).getByRole("menu", { name: "Relationship type" });
  // Only what the rules allow from an application to a SaaS application, most used first.
  await expect(menu.getByRole("menuitem")).toHaveText(["contains", "flows to"]);
  await menu.getByRole("menuitem", { name: "flows to" }).click();
  await expect(canvas(page).locator('.line[data-relationship="flows to"]')).toHaveCount(3);
  await expect(relations(page)).toContainText("Payments Hub");
  await saved(page);
});

test("does not offer an existing relationship already drawn between the two symbols", async ({ page }) => {
  await signIn(page);
  await openDiagram(page);
  // The lower Claims Manager already has a "flows to" line to Payments Hub.
  const lower = canvas(page).locator('.occ[data-name="Claims Manager"]:has(rect[y="320"])');
  await lower.click();
  const from = (await canvas(page).getByLabel("Connect").boundingBox())!;
  await drag(page, { x: from.x + from.width / 2, y: from.y + from.height / 2 }, await centre(page, "Payments Hub"));
  const menu = canvas(page).getByRole("menu", { name: "Relationship type" });
  await expect(menu.getByRole("menuitem")).toHaveText(["contains", "flows to"]);
  await page.keyboard.press("Escape");
});

test("moves a symbol on the grid, and the move survives a reload", async ({ page }) => {
  await signIn(page);
  await openDiagram(page);
  await addFromPalette(page, "Application", "Broker Portal", 300, 440);
  const start = await position(page, "Broker Portal");
  const c = await centre(page, "Broker Portal");
  await drag(page, c, { x: c.x - 101, y: c.y + 37 });
  const moved = await position(page, "Broker Portal");
  expect(moved).toEqual({ x: start.x - 104, y: start.y + 40 });
  await saved(page);

  await page.reload();
  await saved(page);
  await openDiagram(page);
  expect(await position(page, "Broker Portal")).toEqual(moved);
});

test("Delete removes from the diagram; Shift+Delete deletes the object", async ({ page }) => {
  await signIn(page);
  await openDiagram(page);
  await addFromPalette(page, "Application", "Temp Tool", 500, 440);
  await addFromPalette(page, "Application", "Scratch App", 100, 540);
  await canvas(page).focus();

  // Delete: only the occurrence goes; the object stays in the model.
  await symbol(page, "Temp Tool").click();
  await page.keyboard.press("Delete");
  await expect(symbol(page, "Temp Tool")).toHaveCount(0);
  const toast = page.getByRole("status").filter({ hasText: "Remove Temp Tool from Claims landscape" });
  await expect(toast.getByRole("button", { name: "Delete object" })).toBeVisible();
  await explorer(page).getByLabel("Filter the explorer").fill("Temp Tool");
  await expect(explorer(page).locator(".row", { hasText: "Temp Tool" })).toHaveCount(1);
  // …and the toast offers to delete the object as well.
  await toast.getByRole("button", { name: "Delete object" }).click();
  await page.getByRole("dialog", { name: "Delete Temp Tool" }).getByRole("button", { name: "Delete object" }).click();
  await expect(explorer(page).locator(".row", { hasText: "Temp Tool" })).toHaveCount(0);

  // Shift+Delete: the object goes, after a dialog that says what goes with it.
  await symbol(page, "Scratch App").click();
  await page.keyboard.press("Shift+Delete");
  const dialog = page.getByRole("dialog", { name: "Delete Scratch App" });
  await expect(dialog).toContainText("Also on 0 other diagrams");
  await dialog.getByRole("button", { name: "Delete object" }).click();
  await expect(symbol(page, "Scratch App")).toHaveCount(0);
  await explorer(page).getByLabel("Filter the explorer").fill("Scratch App");
  await expect(explorer(page).locator(".row", { hasText: "Scratch App" })).toHaveCount(0);
  await saved(page);
});

test("renames with F2 on the canvas", async ({ page }) => {
  await signIn(page);
  await openDiagram(page);
  await addFromPalette(page, "Application", "Policy Admin", 300, 540);
  await symbol(page, "Policy Admin").click();
  await page.keyboard.press("F2");
  const box = canvas(page).getByLabel("Rename Policy Admin");
  await box.fill("Policy Hub");
  await box.press("Enter");
  await expect(symbol(page, "Policy Hub")).toHaveCount(1);
  await expect(properties(page).getByLabel("Name")).toHaveValue("Policy Hub");
  await saved(page);
});

test("validation scenario 4: one renames while the other moves, and both changes survive", async ({ browser }) => {
  const dana = await newPage(browser, "dana@example.com");
  const lee = await newPage(browser, "lee@example.com");
  const start = await position(lee, "Claim Settlement");

  // Lee starts dragging Claim Settlement…
  const c = await corner(lee, "Claim Settlement");
  await lee.mouse.move(c.x, c.y);
  await lee.mouse.down();
  await lee.mouse.move(c.x + 20, c.y + 30, { steps: 4 });

  // …Dana renames it meanwhile, and Lee sees the new name while still dragging…
  const d = await corner(dana, "Claim Settlement");
  await dana.mouse.dblclick(d.x, d.y);
  await canvas(dana).getByLabel("Rename Claim Settlement").fill("Claim Payout");
  await canvas(dana).getByLabel("Rename Claim Settlement").press("Enter");
  await expect(symbol(lee, "Claim Payout")).toHaveCount(1);

  // …then Lee drops it.
  // (Claim Settlement is nested: its position is kept relative to its parent, and that is what snaps to the grid.)
  await lee.mouse.move(c.x + 42, c.y + 60, { steps: 4 });
  await lee.mouse.up();
  const moved = { x: start.x + 42, y: start.y + 60 };

  for (const page of [dana, lee]) {
    await expect(symbol(page, "Claim Payout")).toHaveCount(1);
    await expect.poll(() => position(page, "Claim Payout")).toEqual(moved);
    await saved(page);
  }
  await dana.reload();
  await saved(dana);
  await openDiagram(dana);
  expect(await position(dana, "Claim Payout")).toEqual(moved);
  await dana.context().close();
  await lee.context().close();
});

test("shows an occurrence as a card, undoes it, cycles with R, and draws glyphs when zoomed out", async ({ page }) => {
  await signIn(page);
  await openDiagram(page);
  await addFromPalette(page, "Application", "Premium Calculator", 660, 560);
  const quote = symbol(page, "Premium Calculator");
  await expect(quote).toHaveAttribute("data-rendition", "box");
  const boxWidth = await quote.locator("rect").first().getAttribute("width");

  // Right-click › Show as › Card: one change, which resizes the occurrence to the card's size.
  await quote.locator("rect").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Show as" }).click();
  await page.getByRole("menuitem", { name: "Card" }).click();
  await expect(quote).toHaveAttribute("data-rendition", "card");
  await expect(quote.locator("rect").first()).toHaveAttribute("width", "180");
  await saved(page);

  // One undo puts both the rendition and the size back.
  const toast = page.getByRole("status").filter({ hasText: "Show Premium Calculator as card" });
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(quote).toHaveAttribute("data-rendition", "box");
  await expect(quote.locator("rect").first()).toHaveAttribute("width", boxWidth!);
  await saved(page);

  // R steps to the next rendition.
  await quote.locator("rect").first().click();
  await page.keyboard.press("r");
  await expect(quote).toHaveAttribute("data-rendition", "card");
  await page.keyboard.press("r");
  await expect(quote).toHaveAttribute("data-rendition", "glyph");
  await page.keyboard.press("r");
  await expect(quote).toHaveAttribute("data-rendition", "chip");
  await saved(page);

  // Below 40% every occurrence that holds nothing is drawn as its glyph; back at 100% the chip returns.
  const zoom = page.getByRole("group", { name: "Zoom" });
  for (let i = 0; i < 4; i++) await zoom.getByRole("button", { name: "Zoom out" }).click();
  await expect(zoom.getByRole("button", { name: "Reset zoom" })).toHaveText("33%");
  await expect(quote).toHaveAttribute("data-rendition", "glyph");
  await expect(symbol(page, "Payments Hub")).toHaveAttribute("data-rendition", "glyph");
  // A container keeps its form, so what is nested inside it stays visible.
  await expect(symbol(page, "Claims Management")).toHaveAttribute("data-rendition", "box");
  await zoom.getByRole("button", { name: "Reset zoom" }).click();
  await expect(quote).toHaveAttribute("data-rendition", "chip");
});
