// Slice Sem-1 (design/02-model/semantics.md §11): relationships read by what they mean, and every object has a level.
import { expect, test, type Page } from "@playwright/test";

const explorer = (page: Page) => page.getByRole("navigation", { name: "Explorer" });
const properties = (page: Page) => page.getByRole("complementary", { name: "Properties" });

async function openPaymentsHub(page: Page) {
  await page.goto("/");
  await page.getByLabel("Workspace").fill("W-DEV");
  await page.getByLabel("Email").fill("dev@example.com");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Insurance Group EA" }).click();
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
  await explorer(page).getByLabel("Filter the explorer").fill("Payments Hub");
  await explorer(page).locator(".row", { hasText: "Payments Hub" }).first().click();
  await expect(properties(page).getByLabel("Name")).toHaveValue("Payments Hub");
}

test("groups relationships by kind and keeps a level set on an object", async ({ page }) => {
  await openPaymentsHub(page);
  const relationships = properties(page).locator(".group", { hasText: "Relationships" });
  // Earlier specs may add relationships to Payments Hub, so only these groups are checked.
  await expect(relationships.locator('.rel-group[data-kind="realisation"] h4')).toHaveText("What this implements");
  await expect(relationships.locator('.rel-group[data-kind="flow"] h4')).toHaveText("Upstream");
  await expect(relationships.locator('.rel-group[data-kind="flow"]')).toContainText("receives from ← Claims Manager");

  const level = properties(page).getByLabel("Level");
  await expect(level.locator("option").first()).toHaveText("Implementation (type default)");
  await level.selectOption({ label: "Logical" });
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
  await page.reload();
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
  await explorer(page).getByLabel("Filter the explorer").fill("Payments Hub");
  await explorer(page).locator(".row", { hasText: "Payments Hub" }).first().click();
  await expect(properties(page).getByLabel("Level")).toHaveValue("logical");
});
