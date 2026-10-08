// Duplicates, slice D-2 (design/02-model/duplicates-and-identity.md §4): a type's name policy is set in the
// metamodel, and the find-or-create box and the engine follow it. It puts the setting back at the end.
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

const saved = (page: Page) => expect(page.getByTestId("save-state")).toHaveText("All changes saved");
const explorer = (page: Page) => page.getByRole("navigation", { name: "Explorer" });

async function openMetamodel(page: Page, item: string) {
  await page.getByRole("menubar").getByRole("menuitem", { name: "Metamodel", exact: true }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
  await expect(page.getByRole("tablist", { name: "Metamodel views" })).toBeVisible();
}

async function setDataObjectRepeats(page: Page, value: "Refused" | "Saved with a warning", summary: RegExp) {
  await openMetamodel(page, "Types");
  // The type stays selected after a publish; clicking it again would close its panel.
  const row = page.getByRole("table", { name: "Object types" }).locator('tr[data-type="dataObject"]');
  if ((await row.getAttribute("aria-selected")) !== "true") await row.click();
  const settings = page.getByRole("region", { name: "Duplicates" });
  await expect(settings.getByLabel("Uniqueness")).toHaveValue("repository");
  await settings.getByLabel("A repeated name is").selectOption({ label: value });
  await page
    .getByRole("region", { name: "Unpublished changes" })
    .getByRole("button", { name: "Review and publish…" })
    .click();
  const review = page.getByRole("dialog", { name: "Publish the metamodel" });
  await expect(review.getByText(summary)).toBeVisible();
  await review.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Published metamodel/ })).toBeVisible();
}

async function nameNewDataObject(page: Page, name: string) {
  await explorer(page).getByLabel("Filter the explorer").fill("Payment");
  await explorer(page).locator(".row", { hasText: "Payment" }).first().click();
  await explorer(page).getByRole("button", { name: "+ Object" }).click();
  await explorer(page).getByLabel("Object type").selectOption({ label: "Data object" });
  await explorer(page).getByLabel("New object name").fill(name);
  return explorer(page).getByRole("listbox", { name: "Existing or new" }).getByRole("option").last();
}

test("a data object's repeated name is warned about, and refused once the metamodel says so", async ({ page }) => {
  await signIn(page);
  // Essentials warns: creating a second "Payment" is possible, and says so.
  const create = await nameNewDataObject(page, "payment");
  await expect(create).toContainText("already exists in this repository: allowed, but discouraged");
  await explorer(page).getByLabel("New object name").press("Escape");

  await setDataObjectRepeats(page, "Refused", /Data object · Unique in the repository, refused/);
  const refused = await nameNewDataObject(page, "payment");
  await expect(refused).toHaveText('A Data object named "Payment" already exists in this repository');
  await expect(refused).toHaveAttribute("aria-disabled", "true");
  await explorer(page).getByLabel("New object name").press("Escape");

  await setDataObjectRepeats(page, "Saved with a warning", /Data object · Unique in the repository, warned/);
  await saved(page);
});
