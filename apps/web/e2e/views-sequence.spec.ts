// Sequence views, slice V-3 (design/02-model/views-and-design-artifacts.md §6): lifelines are elements of the model,
// a new interaction with its request, a response, another request moved up a step, all of it after a reload. The
// interface it creates is deleted at the end, which takes the interaction and its messages with it.
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
const steps = (page: Page) => page.getByRole("table", { name: "Steps" }).locator("tbody tr");

test("draws an interaction as a sequence: request, response, a step moved, kept after a reload", async ({ page }) => {
  await signIn(page);
  await row(page, "Applications").click();
  await page.getByRole("menubar").getByRole("menuitem", { name: "File" }).click();
  await menuItem(page, "New object").click();
  await explorer(page).getByLabel("Object type").selectOption({ label: "Interface" });
  await explorer(page).getByLabel("New object name").fill("Intake API");
  await explorer(page).getByLabel("New object name").press("Enter");
  await saved(page);

  await row(page, "Diagrams").click();
  await page.getByRole("menubar").getByRole("menuitem", { name: "File" }).click();
  await menuItem(page, "New diagram").click();
  await page.getByRole("dialog", { name: "New diagram" }).getByRole("radio", { name: "Sequence diagram" }).check();
  await page.getByRole("dialog", { name: "New diagram" }).getByLabel("Diagram name").fill("Register a claim");
  await page.getByRole("dialog", { name: "New diagram" }).getByLabel("Diagram name").press("Enter");

  await page.getByLabel("Add lifeline").selectOption({ label: "Claims Manager" });
  await page.getByLabel("Add lifeline").selectOption({ label: "Intake API" });
  const sequence = page.getByRole("img", { name: "Register a claim" });
  await expect(sequence.locator("[data-lifeline]")).toHaveCount(2);

  // A new interaction and its request, in one change.
  await page.getByRole("button", { name: "Add message" }).click();
  const form = page.getByRole("dialog", { name: "New message" });
  await form.getByLabel("Message name").fill("POST /claims");
  await form.getByRole("button", { name: "New interaction: Claims Manager calls Intake API" }).click();
  await expect(sequence.getByRole("button", { name: "Message 1. POST /claims" })).toBeVisible();

  // The response comes back under it, dashed.
  await page.getByRole("button", { name: "Add response" }).click();
  await expect(sequence.locator(".seq-message.response")).toHaveCount(1);

  // Another request in the same interaction goes at the end; moving it up changes only its step here.
  await page.getByRole("button", { name: "Add message" }).click();
  await form.getByLabel("Message name").fill("Validate");
  await form.getByRole("button", { name: /^New request in/ }).click();
  await page.getByRole("button", { name: "Move up" }).click();
  await page.getByLabel("Steps table").check();
  await expect(steps(page).locator("td:nth-child(4)")).toHaveText(["POST /claims", "Validate", "response"]);
  await saved(page);

  await page.reload();
  const repository = page.getByRole("button", { name: "Insurance Group EA", exact: true });
  await expect(page.getByTestId("save-state").or(repository)).toBeVisible();
  if (await repository.isVisible()) await repository.click();
  await saved(page);
  await explorer(page).getByLabel("Filter the explorer").fill("Register a claim");
  await row(page, "Register a claim").dblclick();
  await page.getByLabel("Steps table").check();
  await expect(steps(page).locator("td:nth-child(4)")).toHaveText(["POST /claims", "Validate", "response"]);
  await expect(page.getByRole("img", { name: "Register a claim" }).locator(".seq-activation")).toHaveCount(1);

  // Deleting the interface deletes the interaction and its messages; the lifeline goes with it.
  await explorer(page).getByLabel("Filter the explorer").fill("Intake API");
  await row(page, "Intake API").click({ button: "right" });
  await menuItem(page, /^Delete object/).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete object" }).click();
  await expect(steps(page)).toHaveCount(0);
  await saved(page);
});
