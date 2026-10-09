// Slices Sem-1 to Sem-4 (design/02-model/semantics.md §11): relationships read by what they mean, every object has
// an abstraction, containment is the structure the explorer and diagrams show, interactions carry their messages, and
// traces follow meaning.
import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

const explorer = (page: Page) => page.getByRole("navigation", { name: "Explorer" });
const properties = (page: Page) => page.getByRole("complementary", { name: "Properties" });
const relations = (page: Page) => page.getByRole("complementary", { name: "Relations" });
const canvas = (page: Page) => page.getByRole("application", { name: "Diagram Claims landscape" });
const symbol = (page: Page, name: string) => canvas(page).locator(`.occ[data-name="${name}"]`);
const row = (page: Page, name: string) => explorer(page).locator(".row", { hasText: new RegExp(`^\\W*${name}$`) });
/** The rows shown directly inside an object's row in the explorer tree. */
const contentsRow = (page: Page, parent: string, child: string) =>
  row(page, parent).locator("xpath=..").locator(":scope > ul > li > .row", { hasText: child });
const saved = (page: Page) => expect(page.getByTestId("save-state")).toHaveText("All changes saved");

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Workspace").fill("W-DEV");
  await page.getByLabel("Email").fill("dev@example.com");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Insurance Group EA" }).click();
  await saved(page);
}

async function select(page: Page, name: string) {
  await explorer(page).getByLabel("Filter the explorer").fill(name);
  await explorer(page).locator(".row", { hasText: name }).first().click();
  await expect(properties(page).getByLabel("Name")).toHaveValue(name);
  await explorer(page).getByLabel("Filter the explorer").fill("");
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

async function box(page: Page, name: string) {
  return (await symbol(page, name).locator("rect").first().boundingBox())!;
}

test("groups relationships by kind and keeps an abstraction set on an object", async ({ page }) => {
  await signIn(page);
  await select(page, "Payments Hub");
  const relationships = relations(page);
  // Earlier specs may add relationships to Payments Hub, so only these groups are checked.
  await expect(relationships.locator('.rel-group[data-kind="realisation"] h4')).toHaveText("What this implements");
  await expect(relationships.locator('.rel-group[data-kind="flow"] h4')).toHaveText("Upstream");
  await expect(relationships.locator('.rel-group[data-kind="flow"]')).toContainText("receives from ← Claims Manager");

  const abstraction = properties(page).getByLabel("Abstraction");
  await expect(abstraction.locator("option").first()).toHaveText("Implementation (type default)");
  await abstraction.selectOption({ label: "Logical" });
  await saved(page);
  await page.reload();
  await saved(page);
  await select(page, "Payments Hub");
  await expect(properties(page).getByLabel("Abstraction")).toHaveValue("logical");
});

test("drawing a containment nests the content; the explorer shows it inside and can take it out", async ({ page }) => {
  await signIn(page);
  await explorer(page).getByLabel("Filter the explorer").fill("Claims landscape");
  await explorer(page).locator(".row", { hasText: "Claims landscape" }).dblclick();
  await explorer(page).getByLabel("Filter the explorer").fill("");
  await addFromPalette(page, "Application", "Core Banking", 100, 560);
  await addFromPalette(page, "Application", "Card Feed", 500, 560);

  await symbol(page, "Core Banking").click();
  const handle = (await canvas(page).getByLabel("Connect").boundingBox())!;
  const target = await box(page, "Card Feed");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  await canvas(page)
    .getByRole("menu", { name: "Relationship type" })
    .getByRole("menuitem", { name: "contains" })
    .click();
  await saved(page);

  // The container grew around its new content.
  const outer = await box(page, "Core Banking");
  const inner = await box(page, "Card Feed");
  expect(inner.x).toBeGreaterThan(outer.x);
  expect(inner.y + inner.height).toBeLessThan(outer.y + outer.height);

  // In the explorer, Card Feed sits under Core Banking; dropping it on its folder takes it out.
  await expect(contentsRow(page, "Core Banking", "Card Feed")).toHaveCount(1);
  await row(page, "Card Feed").dragTo(row(page, "Applications"));
  await saved(page);
  await expect(contentsRow(page, "Core Banking", "Card Feed")).toHaveCount(0);
  await expect(row(page, "Card Feed")).toHaveCount(1);
  await expect(page.getByRole("status").filter({ hasText: "Take Card Feed out of Core Banking" })).toBeVisible();

  // Dropping it onto Core Banking in the explorer puts it back, and a reload keeps it there.
  await row(page, "Card Feed").dragTo(row(page, "Core Banking"));
  await saved(page);
  await page.reload();
  await saved(page);
  await expect(contentsRow(page, "Core Banking", "Card Feed")).toHaveCount(1);
});

async function connect(page: Page, from: string, to: string, verb: string) {
  await symbol(page, from).click();
  const handle = (await canvas(page).getByLabel("Connect").boundingBox())!;
  const target = await box(page, to);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  await canvas(page).getByRole("menu", { name: "Relationship type" }).getByRole("menuitem", { name: verb }).click();
}

test("an interaction holds its request and response with their payloads, and deleting it is undone in one step", async ({
  page,
}) => {
  await signIn(page);
  await explorer(page).getByLabel("Filter the explorer").fill("Claims landscape");
  await explorer(page).locator(".row", { hasText: "Claims landscape" }).dblclick();
  await explorer(page).getByLabel("Filter the explorer").fill("");
  await addFromPalette(page, "Application", "Quote Engine", 100, 760);
  await addFromPalette(page, "Interface", "Rating API", 520, 760);

  // Connecting with an interaction type creates it with an empty request, and shows it in the panel.
  await connect(page, "Quote Engine", "Rating API", "calls");
  await saved(page);
  await expect(canvas(page).locator(".line-label", { hasText: "⇄ Calls" })).toHaveCount(1);
  const messages = properties(page).locator(".group", { hasText: "Messages" });
  await expect(messages.locator("li[data-role]")).toHaveCount(1);
  await messages.getByRole("button", { name: "Add response" }).click();
  await expect(messages.locator("li[data-role]")).toHaveCount(2);

  const request = messages.locator('li[data-role="request"]');
  const response = messages.locator('li[data-role="response"]');
  await request.getByRole("combobox", { name: "Add to payload" }).fill("Claim Intake");
  await page.getByRole("option", { name: /^Claim Intake/ }).click();
  await response.getByRole("combobox", { name: "Add to payload" }).fill("Handle Claim");
  await page.getByRole("option", { name: /^Handle Claim/ }).click();
  await saved(page);
  await expect(request.locator(".chip")).toHaveText(["Claim Intake×"]);
  await expect(response.locator(".chip")).toHaveText(["Handle Claim×"]);

  // Deleting the interaction takes its messages; one undo brings back all three.
  await properties(page).getByRole("button", { name: "Delete relationship" }).click();
  const toast = page.getByRole("status").filter({ hasText: "and its 2 messages" });
  await expect(canvas(page).locator(".line-label", { hasText: "⇄ Calls" })).toHaveCount(0);
  await expect(toast.getByRole("button", { name: "Undo" })).toBeEnabled();
  await toast.getByRole("button", { name: "Undo" }).click();
  await saved(page);
  await page.reload();
  await saved(page);
  await select(page, "Quote Engine");
  const calls = relations(page).locator('.rel-group[data-kind="interaction"]');
  await expect(calls.locator('li[data-role="request"]')).toContainText("Claim Intake");
  await expect(calls.locator('li[data-role="response"]')).toContainText("Handle Claim");
});

test("traces upstream by meaning, highlights the result on the diagram and shows meaning in the explorer", async ({
  page,
}) => {
  await signIn(page);
  await explorer(page).getByLabel("Filter the explorer").fill("Claims landscape");
  await explorer(page).locator(".row", { hasText: "Claims landscape" }).dblclick();
  await explorer(page).getByLabel("Filter the explorer").fill("");
  await select(page, "Payments Hub");

  await relations(page).getByRole("tab", { name: "Trace" }).click();
  const tracePanel = relations(page).locator(".trace");
  await tracePanel.getByLabel("Trace").selectOption({ label: "Upstream" });
  await expect(tracePanel.locator('.trace-column[data-abstraction="implementation"]')).toContainText("Claims Manager");
  await expect(tracePanel.locator('.trace-column[data-abstraction="implementation"]')).toContainText("Legacy CRM");
  await expect(symbol(page, "Claims Manager").first()).toHaveClass(/traced/);
  await tracePanel.getByLabel("Trace").selectOption({ label: "Choose a trace…" });
  await expect(canvas(page).locator(".occ.traced")).toHaveCount(0);

  // In the explorer, Payments Hub opens on demand into its meaning: what it implements, what flows into it.
  await row(page, "Payments Hub").locator(".icon").click();
  const upstream = row(page, "Payments Hub")
    .locator("xpath=..")
    .locator('li.meaning[data-kind="flow"]', { hasText: "Upstream" });
  await upstream.locator(".group-row").click();
  await upstream.locator(".ref-row", { hasText: "Claims Manager" }).click();
  await expect(properties(page).getByLabel("Name")).toHaveValue("Claims Manager");
});
