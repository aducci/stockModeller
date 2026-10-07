// Property administration, slice A-1b (design/02-model/metamodel.md §3 and §7): new property types given to object
// and diagram types, the properties panel following the published definitions in every open session, and values
// kept (and clearable) when a type stops carrying a property. It only adds properties of its own, so the specs that
// run after it keep the metamodel they expect.
import { expect, test, type Browser, type Page } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

async function signIn(page: Page, userId: string) {
  await page.goto("/");
  await page.getByLabel("Workspace").fill("W-DEV");
  await page.getByLabel("Email").fill(userId);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Insurance Group EA" }).click();
  await saved(page);
}

async function newPage(browser: Browser, userId: string) {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  await signIn(page, userId);
  return page;
}

const saved = (page: Page) => expect(page.getByTestId("save-state")).toHaveText("All changes saved");
const explorer = (page: Page) => page.getByRole("navigation", { name: "Explorer" });
const properties = (page: Page) => page.getByRole("complementary", { name: "Properties" });

async function select(page: Page, name: string) {
  await explorer(page).getByLabel("Filter the explorer").fill(name);
  await explorer(page).locator(".row", { hasText: name }).first().click();
  await expect(properties(page).getByLabel("Name")).toHaveValue(name);
}

async function openMetamodel(page: Page, item: string) {
  await page.getByRole("menubar").getByRole("menuitem", { name: "Metamodel", exact: true }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
  await expect(page.getByRole("tablist", { name: "Metamodel views" })).toBeVisible();
}

async function publish(page: Page, expectations: (review: ReturnType<Page["getByRole"]>) => Promise<void>) {
  await page
    .getByRole("region", { name: "Unpublished changes" })
    .getByRole("button", { name: "Review and publish…" })
    .click();
  const review = page.getByRole("dialog", { name: "Publish the metamodel" });
  await expectations(review);
  await review.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Published metamodel/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Unpublished changes" })).toHaveCount(0);
}

test("adds properties to object and diagram types, and every open panel shows them", async ({ browser }) => {
  const dana = await newPage(browser, "dana@example.com");
  const lee = await newPage(browser, "lee@example.com");
  await select(lee, "SRV-APP-01");
  await expect(properties(lee).getByLabel("Risk notes")).toHaveCount(0);

  // A text property, keyed from its group and name, given to servers.
  await openMetamodel(dana, "Properties");
  await dana.getByRole("button", { name: "New property" }).click();
  const form = dana.getByRole("form", { name: /^Property / });
  await form.getByLabel("Name", { exact: true }).fill("Risk notes");
  await form.getByRole("combobox", { name: "Group" }).fill("risk");
  await expect(form).toContainText("risk.riskNotes");
  const usedBy = form.getByRole("region", { name: "Used by" });
  await usedBy.getByRole("checkbox", { name: "Server", exact: true }).check();

  // A list property with its own values, given to application landscapes.
  await dana.getByRole("button", { name: "New property" }).click();
  await form.getByLabel("Name", { exact: true }).fill("Review state");
  await form.getByRole("combobox", { name: "Group" }).fill("review");
  await form.getByLabel("Data type").selectOption("list");
  const values = form.getByRole("region", { name: "List values" });
  for (const label of ["Draft", "Approved"]) {
    await values.getByLabel("New value").fill(label);
    await values.getByRole("button", { name: "Add value" }).click();
  }
  await expect(values.locator("[data-value]")).toHaveCount(2);
  await usedBy.getByRole("checkbox", { name: "Application landscape" }).check();
  await expect(dana.getByRole("region", { name: "Unpublished changes" })).toContainText("2 changes not published");

  await publish(dana, async (review) => {
    await expect(review).toContainText("Properties added (2)");
    await expect(review).toContainText("Server · Risk notes");
    await expect(review).toContainText("Application landscape · Review state");
  });

  // Lee's panel, open all along, now has the field; Dana fills it and Lee sees the value.
  const risk = properties(lee).getByLabel("Risk notes");
  await expect(risk).toBeVisible();
  await select(dana, "SRV-APP-01");
  await properties(dana).getByLabel("Risk notes").fill("Out of support next year");
  await properties(dana).getByLabel("Risk notes").press("Enter");
  await saved(dana);
  await expect(risk).toHaveValue("Out of support next year");

  // The diagram carries its new property too.
  await select(dana, "Claims landscape");
  const state = properties(dana).getByRole("radiogroup", { name: "Review state" });
  await state.getByRole("radio", { name: "Draft" }).click();
  await expect(state.getByRole("radio", { name: "Draft" })).toHaveAttribute("aria-checked", "true");
  await saved(dana);
});

test("taking a property away from a type keeps its values until someone clears them", async ({ page }) => {
  await signIn(page, "dana@example.com");
  await openMetamodel(page, "Types");
  await page.getByRole("table", { name: "Object types" }).locator('tr[data-type="server"]').click();
  const panel = page.getByRole("complementary", { name: "Properties of Server" });
  await expect(panel.getByRole("list", { name: "Own properties" })).toContainText("Risk notes");
  await panel.getByRole("button", { name: "Remove Risk notes from Server" }).click();

  await publish(page, async (review) => {
    await expect(review).toContainText("Taken from types (1)");
    await expect(review.getByRole("list", { name: "Values kept" })).toContainText("Risk notes × 1");
  });

  await select(page, "SRV-APP-01");
  const panelProps = properties(page);
  await expect(panelProps.getByLabel("Risk notes", { exact: true })).toHaveCount(0);
  const stranded = panelProps.locator('[data-section$=":stranded"]');
  await expect(stranded).toContainText("Not on this type");
  await expect(stranded).toContainText("Out of support next year");
  await stranded.getByRole("button", { name: "Clear Risk notes" }).click();
  await saved(page);
  await expect(stranded).toHaveCount(0);
});
