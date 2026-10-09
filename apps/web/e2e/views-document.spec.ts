// Document views, slice V-2 (design/02-model/views-and-design-artifacts.md §7): a High-level design made from an
// object, prose with mentions (one of them a new element), the context diagram created from its section, the
// integrations table bound to that diagram's connectors, and completeness, all of it after a reload.
// Payments Hub is the subject; the element it creates is deleted again at the end.
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

test("writes a high-level design whose integrations follow its context diagram", async ({ page }) => {
  await signIn(page);
  await explorer(page).getByLabel("Filter the explorer").fill("Payments Hub");
  await row(page, "Payments Hub").click({ button: "right" });
  await menuItem(page, "New").hover();
  await menuItem(page, "High-level design").click();
  await expect(page.getByRole("heading", { name: "Payments Hub high-level design" })).toBeVisible();
  const completeness = page.getByRole("button", { name: /sections complete/ });
  await expect(completeness).toHaveText("2 of 5 sections complete");

  // Prose with a mention of an existing element and of a new one, created from the text.
  await section(page, "Summary").getByRole("button", { name: "Write summary…" }).click();
  const text = section(page, "Summary").getByRole("textbox", { name: "Summary" });
  await text.pressSequentially("Settles claims with @Legacy");
  await page.getByRole("option", { name: /Legacy CRM/ }).click();
  await text.pressSequentially("and screens them with @Fraud Screening");
  await page.getByLabel("Type of the new element").selectOption({ label: "Application" });
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("heading", { name: "Payments Hub high-level design" }).click(); // away: saves
  const summary = section(page, "Summary");
  await expect(summary.locator(".doc-prose p")).toHaveText(
    "Settles claims with Legacy CRM and screens them with Fraud Screening",
  );
  await expect(summary.getByRole("button", { name: "Fraud Screening" })).toBeVisible();

  // The context is a diagram the author draws; the table waits for it.
  const integrations = section(page, "Information flows");
  await expect(integrations).toContainText("Create the context diagram first");
  await section(page, "Context").getByRole("button", { name: "Create context diagram" }).click();
  await expect(section(page, "Context").getByRole("img", { name: "Diagram preview" })).toContainText("Payments Hub");

  // Claims Manager flows to Payments Hub in the model but is not drawn: the banner offers to add it.
  await expect(integrations.getByRole("status")).toContainText("missing from the context: Claims Manager");
  await integrations.getByRole("button", { name: "Add to context" }).click();
  await expect(section(page, "Context").getByRole("img", { name: "Diagram preview" })).toContainText("Claims Manager");
  const claims = integrations.locator("tbody tr[data-relationship]", { hasText: "Claims Manager" });
  await expect(claims.getByLabel("Protocol of Claims Manager")).toHaveValue("REST");
  await expect(claims).toContainText("← receives from");

  // A new integration is a relationship placed on the context in the same change; it must be described.
  await integrations.getByRole("button", { name: "+ Add integration" }).click();
  await integrations.getByRole("combobox", { name: "Counterpart" }).fill("Fraud");
  await page.getByRole("option", { name: /^Fraud Screening/ }).click();
  await integrations.getByRole("button", { name: "Payments Hub flows to Fraud Screening" }).click();
  const fraud = integrations.locator("tbody tr[data-relationship]", { hasText: "Fraud Screening" });
  await expect(fraud).toContainText("to describe");
  await expect(section(page, "Context").getByRole("img", { name: "Diagram preview" })).toContainText("Fraud Screening");
  await fraud.getByLabel("Protocol of Fraud Screening").fill("HTTPS");
  await fraud.getByLabel("Protocol of Fraud Screening").press("Enter");
  await expect(fraud).not.toContainText("to describe");
  // Earlier specs may have drawn other flows to Payments Hub without a protocol: describe them too.
  const undescribed = integrations.locator("tbody tr.to-describe");
  for (let i = 0; i < 10 && (await undescribed.count()) > 0; i++) {
    const before = await undescribed.count();
    const input = undescribed.first().getByLabel(/^Protocol of /);
    await input.fill("HTTPS");
    await input.press("Enter");
    await expect(undescribed).toHaveCount(before - 1);
  }
  await expect(completeness).toHaveText("5 of 5 sections complete");
  await saved(page);

  // All of it is the model: it survives a reload.
  await page.reload();
  const repository = page.getByRole("button", { name: "Insurance Group EA", exact: true });
  await expect(page.getByTestId("save-state").or(repository)).toBeVisible();
  if (await repository.isVisible()) await repository.click();
  await saved(page);
  await explorer(page).getByLabel("Filter the explorer").fill("Payments Hub high-level design");
  await row(page, "Payments Hub high-level design").dblclick();
  await expect(completeness).toHaveText("5 of 5 sections complete");
  await expect(section(page, "Summary").getByRole("button", { name: "Legacy CRM" })).toBeVisible();
  await expect(
    section(page, "Information flows")
      .locator("tbody tr[data-relationship]", { hasText: "Fraud Screening" })
      .getByLabel("Protocol of Fraud Screening"),
  ).toHaveValue("HTTPS");

  // Deleting the new element takes its integration with it; the mention says it is gone.
  await explorer(page).getByLabel("Filter the explorer").fill("Fraud Screening");
  await row(page, "Fraud Screening").click({ button: "right" });
  await menuItem(page, /^Delete object/).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete object" }).click();
  await expect(
    section(page, "Information flows").locator("tbody tr[data-relationship]", { hasText: "Fraud Screening" }),
  ).toHaveCount(0);
  await expect(section(page, "Summary")).toContainText("deleted element");
  await saved(page);
});
