// Information flows (DOC-2, design/02-model/views-and-design-artifacts.md §12): under each connection of a design's
// context, the flows it stands for: those it lists, those its ends imply, a sequence about each, and "+ Add flow".
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
const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("a design lists the flows each connection stands for, implied ones too", async ({ page }) => {
  await signIn(page);
  await explorer(page).getByLabel("Filter the explorer").fill("Claims Manager high-level design");
  await row(page, "Claims Manager high-level design").dblclick();
  const flows = section(page, "Information flows");
  await expect(flows).toBeVisible();

  // The conceptual flow to Payments Hub stands for the call to Payments API, which Payments Hub realises, and so for
  // the Pay a claim function that call lists: no link made by hand.
  const implied = flows.locator("tr.doc-flow.implied", { hasText: "Pay a claim" });
  await expect(implied).toContainText("implied by Claims Manager calls Payments API");

  // Adding a flow under Legacy CRM creates the element and lists it, then a sequence about it opens.
  await flows.getByRole("button", { name: "Add flow between Legacy CRM and Claims Manager" }).click();
  await flows.getByLabel("Type of the new flow").selectOption({ label: "Information flow" });
  await flows.getByLabel("Name of the new flow between Legacy CRM and Claims Manager").fill("New claims feed");
  await flows.getByLabel("Name of the new flow between Legacy CRM and Claims Manager").press("Enter");
  await saved(page);
  await flows.getByRole("button", { name: "Create the sequence of New claims feed" }).click();
  await expect(page.getByRole("tablist", { name: "Open items" }).locator('[aria-selected="true"]')).toContainText(
    "New claims feed",
  );
  await saved(page);

  // Back in the design, the implied function can be left out of the conceptual flow.
  await page.getByRole("tab", { name: /Claims Manager high-level design/ }).click();
  await implied.getByRole("button", { name: "Not part of this" }).click();
  await saved(page);
  await expect(implied).toHaveCount(0);
  await page.locator(".toast", { hasText: "Leave Pay a claim out" }).getByRole("button", { name: "Undo" }).click();
  await saved(page);
  await expect(flows.locator("tr.doc-flow.implied", { hasText: "Pay a claim" })).toHaveCount(1);
});
