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
  await expect(panel.locator(".group", { hasText: "Relationships" })).toHaveCount(0);
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
