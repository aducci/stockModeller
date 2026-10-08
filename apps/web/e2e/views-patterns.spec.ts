// Template patterns and locks, slice V-4 (design/02-model/views-and-design-artifacts.md §8): an Integration
// specification built from the Context and integrations pattern, a fixed section, an element created with @+, a block
// per integration with its sequence and error handling, a section added in the region and renamed, a column hidden,
// all of it after a reload. The interface and application it creates are deleted at the end.
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
const row = (page: Page, name: string) => explorer(page).locator(".row", { hasText: name }).first();
const menuItem = (page: Page, name: string | RegExp) => page.getByRole("menuitem", { name, exact: true });
const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

async function deleteObject(page: Page, name: string) {
  await explorer(page).getByLabel("Filter the explorer").fill(name);
  await explorer(page)
    .locator(".row")
    .filter({ has: page.getByText(name, { exact: true }) })
    .first()
    .click({ button: "right" });
  await menuItem(page, /^Delete object/).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete object" }).click();
  await saved(page);
}

test("builds an integration specification from patterns, within the template's locks", async ({ page }) => {
  await signIn(page);
  await row(page, "Applications").click();
  await page.getByRole("menubar").getByRole("menuitem", { name: "File" }).click();
  await menuItem(page, "New object").click();
  await explorer(page).getByLabel("Object type").selectOption({ label: "Interface" });
  await explorer(page).getByLabel("New object name").fill("Quotes API");
  await explorer(page).getByLabel("New object name").press("Enter");
  await saved(page);

  await explorer(page).getByLabel("Filter the explorer").fill("Quotes API");
  await row(page, "Quotes API").click({ button: "right" });
  await menuItem(page, "New").hover();
  await menuItem(page, "Integration specification").click();
  await expect(page.getByRole("heading", { name: "Quotes API integration specification" })).toBeVisible();

  // The pattern's sections sit between the template's own; Purpose is fixed, so it has no options.
  await expect(page.locator(".doc-section > h2")).toHaveText([
    /^Purpose/,
    /^Context/,
    /^Integrations/,
    /^Integration details/,
  ]);
  await expect(section(page, "Purpose")).toContainText("fixed");
  await expect(section(page, "Purpose").getByRole("button", { name: "Options of Purpose" })).toHaveCount(0);

  // @+ creates the element named in the text.
  await section(page, "Purpose").getByRole("button", { name: "Write purpose…" }).click();
  const text = section(page, "Purpose").getByRole("textbox", { name: "Purpose" });
  await text.pressSequentially("Prices quotes with @+Pricing Engine");
  await page.getByLabel("Type of the new element").selectOption({ label: "Application" });
  await text.press("Enter");
  await page.getByRole("heading", { name: "Quotes API integration specification" }).click();
  await expect(section(page, "Purpose").getByRole("button", { name: "Pricing Engine" })).toBeVisible();

  // An interaction drawn on the context is a row, and a block below with its details, sequence and error handling.
  await section(page, "Context").getByRole("button", { name: "Create context diagram" }).click();
  const integrations = section(page, "Integrations");
  await integrations.getByRole("button", { name: "+ Add integration" }).click();
  await integrations.getByLabel("Counterpart").selectOption({ label: "Claims Manager" });
  await integrations.getByRole("button", { name: "Claims Manager calls Quotes API" }).click();
  const details = section(page, "Integration details");
  const block = details.getByRole("group", { name: "Claims Manager" });
  await expect(block).toBeVisible();
  await expect(block.getByRole("region", { name: "Error handling" })).toBeVisible();
  await block.getByRole("button", { name: "+ Create the sequence" }).click();
  await expect(page.getByRole("img", { name: /Claims Manager calls Quotes API/ })).toBeVisible();
  await page.getByRole("tab", { name: /Quotes API integration specification/ }).click();
  await expect(block.getByRole("button", { name: /⇅ Claims Manager calls Quotes API/ })).toBeVisible();
  await block.getByRole("button", { name: "Write error handling…" }).click();
  await block.getByRole("textbox", { name: "Error handling" }).fill("Retry twice, then tell the claims team.");
  await page.getByRole("heading", { name: "Quotes API integration specification" }).click();
  await expect(block.locator(".doc-prose p")).toHaveText("Retry twice, then tell the claims team.");

  // Integrations allows columns: hide an optional one.
  await integrations.getByRole("button", { name: "Hide the Pattern column" }).click();
  await expect(integrations.locator("thead th")).not.toContainText(["Pattern"]);
  await expect(integrations.getByRole("button", { name: "Show Pattern" })).toBeVisible();

  // The region takes sections from its palette; an added section is free, so it can be renamed and removed.
  await page.getByRole("button", { name: /\+ Add section/ }).click();
  const form = page.getByRole("group", { name: "Add a section to Additional sections" });
  await form.getByLabel("Component").selectOption({ label: "Prose" });
  await form.getByLabel("Section title").fill("Security");
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(section(page, "Security")).toBeVisible();
  page.once("dialog", (d) => void d.accept("Security and access"));
  await section(page, "Security").getByRole("button", { name: "Options of Security" }).click();
  await menuItem(page, "Rename…").click();
  await expect(section(page, "Security and access")).toBeVisible();
  await saved(page);

  await page.reload();
  const repository = page.getByRole("button", { name: "Insurance Group EA", exact: true });
  await expect(page.getByTestId("save-state").or(repository)).toBeVisible();
  if (await repository.isVisible()) await repository.click();
  await saved(page);
  await explorer(page).getByLabel("Filter the explorer").fill("Quotes API integration specification");
  await row(page, "Quotes API integration specification").dblclick();
  await expect(section(page, "Security and access")).toBeVisible();
  await expect(section(page, "Integrations").locator("thead th")).not.toContainText(["Pattern"]);
  await expect(
    section(page, "Integration details").getByRole("group", { name: "Claims Manager" }).locator(".doc-prose p"),
  ).toHaveText("Retry twice, then tell the claims team.");

  await section(page, "Security and access").getByRole("button", { name: "Options of Security and access" }).click();
  await menuItem(page, "Remove section").click();
  await expect(section(page, "Security and access")).toHaveCount(0);
  await saved(page);

  // The sequence is named after Claims Manager, which a later spec renames.
  await explorer(page).getByLabel("Filter the explorer").fill("Claims Manager calls Quotes API");
  await row(page, "Claims Manager calls Quotes API").click({ button: "right" });
  await menuItem(page, "Delete diagram").click();
  await saved(page);
  await deleteObject(page, "Quotes API");
  await deleteObject(page, "Pricing Engine");
});
