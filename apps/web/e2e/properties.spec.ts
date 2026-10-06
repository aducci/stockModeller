// The generic properties panel (design/04-ux/workbench.md "Properties panel"): description in the header, editors
// chosen by property type, filter and Hide empty. Uses Legacy CRM without renaming it (other specs rely on its name).
import { expect, test, type Page } from "@playwright/test";

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
const properties = (page: Page) => page.getByRole("complementary", { name: "Properties" });

async function select(page: Page, name: string) {
  await explorer(page).getByLabel("Filter the explorer").fill(name);
  await explorer(page).locator(".row", { hasText: name }).first().click();
  await expect(properties(page).getByLabel("Name")).toHaveValue(name);
}

test("describes an object and sets properties with the editor its type calls for", async ({ page }) => {
  await signIn(page);
  await select(page, "Legacy CRM");
  const panel = properties(page);

  const description = panel.getByLabel("Description");
  await description.fill("Customer records for claims, kept until the new CRM is live.");
  await description.press("Enter");
  // Fit 1–5 is a rating: five pips, one click sets it.
  const fit = panel.getByRole("radiogroup", { name: "Business fit" });
  await expect(fit.getByRole("radio")).toHaveCount(5);
  await fit.getByRole("radio", { name: "2" }).click();
  await expect(fit.getByRole("radio", { name: "2" })).toHaveAttribute("aria-checked", "true");
  await expect(fit).toContainText("2");
  // A long list stays a dropdown.
  await panel.locator("#prop-assessment\\.criticality").selectOption("high");
  await saved(page);

  await page.reload();
  await saved(page);
  await select(page, "Legacy CRM");
  await expect(panel.getByLabel("Description")).toHaveValue(
    "Customer records for claims, kept until the new CRM is live.",
  );
  await expect(
    panel.getByRole("radiogroup", { name: "Business fit" }).getByRole("radio", { name: "2" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(panel.locator("#prop-assessment\\.criticality")).toHaveValue("high");

  // Clicking the chosen pip again clears it; the clear button does the same for any field.
  await panel.getByRole("radiogroup", { name: "Business fit" }).getByRole("radio", { name: "2" }).click();
  await expect(panel.getByRole("radiogroup", { name: "Business fit" })).toContainText("Empty");
  const criticality = panel.locator('[data-property="assessment.criticality"]');
  await criticality.locator("label").hover();
  await criticality.getByRole("button", { name: "Clear value" }).click();
  await expect(panel.locator("#prop-assessment\\.criticality")).toHaveValue("");
  await saved(page);
});

test("filters properties, hides empty ones and remembers collapsed sections", async ({ page }) => {
  await signIn(page);
  await select(page, "Legacy CRM");
  const panel = properties(page);
  const rows = panel.locator(".prop-row");
  const all = await rows.count();

  await panel.getByLabel("Filter properties").fill("fit");
  await expect(rows).toHaveCount(2);
  await expect(panel.locator(".group", { hasText: "Tags" })).toHaveCount(0);
  await panel.getByLabel("Filter properties").fill("");
  await expect(rows).toHaveCount(all);

  await panel.getByRole("button", { name: "Hide empty" }).click();
  await expect(panel.getByRole("button", { name: /^Hide empty · \d+$/ })).toHaveAttribute("aria-pressed", "true");
  expect(await rows.count()).toBeLessThan(all);
  await panel.getByRole("button", { name: /^Hide empty/ }).click();
  await expect(rows).toHaveCount(all);

  await panel.getByRole("button", { name: "Lifecycle" }).click();
  await expect(panel.locator('[data-property="lifecycle.status"]')).toHaveCount(0);
  await page.reload();
  await saved(page);
  await select(page, "Legacy CRM");
  await expect(panel.locator('[data-property="lifecycle.status"]')).toHaveCount(0);
  await panel.getByRole("button", { name: "Lifecycle" }).click();
  await expect(panel.locator("#prop-lifecycle\\.status")).toBeVisible();
});

test("shows a shared property set, saves and edits one of my own, and edits a link", async ({ page }) => {
  await signIn(page);
  await select(page, "Legacy CRM");
  const panel = properties(page);
  const picker = panel.getByLabel("Property set");

  await picker.selectOption({ label: "Quarterly review" });
  await expect(panel.locator(".prop-row label")).toHaveText(
    ["Status*", "Criticality", "Business owner", "Technical owner", "Business fit"].map(
      (t) => new RegExp(`^${t.replace("*", "\\*?")}$`),
    ),
  );

  // Save as set keeps what is shown; editing ticks properties in or out.
  await picker.selectOption({ label: "Save as set…" });
  await panel.getByLabel("Name of the new property set").fill("Lab view");
  await panel.getByLabel("Name of the new property set").press("Enter");
  await expect(picker).toHaveValue(/^my/);
  await picker.selectOption({ label: "Edit this set…" });
  await panel.getByLabel("Include Business fit in the set").uncheck();
  await panel.getByLabel("Include Documentation in the set").check();
  await panel.getByRole("button", { name: "Done" }).click();
  await expect(panel.locator(".prop-row")).toHaveCount(5);
  await expect(panel.locator('[data-property="assessment.businessFit"]')).toHaveCount(0);

  // A link: typed without a scheme, shown as a link, edited with the pencil.
  await panel.getByLabel("Documentation").fill("wiki.example.com/apps/legacy-crm");
  await panel.getByLabel("Documentation").press("Enter");
  const link = panel.locator(".link-value");
  await expect(link).toHaveAttribute("href", "https://wiki.example.com/apps/legacy-crm");
  await expect(link).toHaveText("wiki.example.com/apps/legacy-crm");
  await saved(page);
  await page.reload();
  await saved(page);
  await select(page, "Legacy CRM");
  await expect(panel.getByLabel("Property set")).toHaveValue(/^my/);
  await expect(panel.locator(".link-value")).toHaveAttribute("href", "https://wiki.example.com/apps/legacy-crm");
  await panel.getByRole("button", { name: "Edit Documentation" }).click();
  await panel.getByLabel("Documentation").fill("");
  await panel.getByLabel("Documentation").press("Enter");
  await expect(panel.locator(".link-value")).toHaveCount(0);
  await saved(page);
});

test("the Relations window shows relationships by view, traces and where an object occurs", async ({ page }) => {
  await signIn(page);
  await select(page, "Payments Hub");
  const relations = page.getByRole("complementary", { name: "Relations" });
  await expect(relations.getByRole("tab", { name: "Relationships" })).toHaveAttribute("aria-selected", "true");
  await expect(relations.locator('.rel-group[data-kind="flow"]')).toContainText("Claims Manager");

  await relations.getByLabel("Filter relationships").fill("zzz");
  await expect(relations).toContainText("Nothing matches.");
  await relations.getByLabel("Filter relationships").fill("");

  await relations.getByLabel("Relationship view").selectOption({ label: "By object" });
  await expect(relations.locator("li[data-object]").first()).toBeVisible();
  await relations.getByLabel("Relationship view").selectOption({ label: "Data flows (2 steps)" });
  await expect(relations.locator('[data-direction="backward"] h4')).toHaveText("Upstream");
  await expect(relations.locator('[data-direction="backward"]')).toContainText("Claims Manager");
  await relations.getByLabel("Relationship view").selectOption({ label: "By meaning" });

  // Occurs on: open a diagram from the list; an object not on it can be added to it.
  await relations.getByRole("tab", { name: "Occurs on" }).click();
  await relations.locator("li[data-diagram] button").first().click();
  await expect(page.getByRole("tablist", { name: "Open items" }).getByRole("tab")).toHaveCount(1);

  await explorer(page).getByLabel("Filter the explorer").fill("");
  await explorer(page).locator(".row", { hasText: "Diagrams" }).first().click();
  await page.getByRole("menubar").getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "New diagram", exact: true }).click();
  await explorer(page).getByLabel("New diagram name").fill("Relations Lab");
  await explorer(page).getByLabel("New diagram name").press("Enter");
  await expect(page.getByRole("tab", { name: /Relations Lab/ })).toBeVisible();
  await select(page, "Payments Hub");
  await relations.getByRole("button", { name: "Add to Relations Lab" }).click();
  await expect(relations.locator("li[data-diagram]", { hasText: "Relations Lab" })).toBeVisible();
  await expect(page.locator(".canvas .occ", { hasText: "Payments Hub" })).toHaveCount(1);
  await saved(page);
});
