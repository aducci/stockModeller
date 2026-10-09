// The RAID register (design/02-model/views-and-design-artifacts.md §14, slice DOC-3): a high-level design lists the
// risks, assumptions, issues and dependencies it mentions or that concern what it shows; one is added from the
// register and another made from a sentence of prose. Both are deleted again at the end.
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
  await row(page, name).click({ button: "right" });
  await menuItem(page, /^Delete object/).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete object" }).click();
}

test("a design's RAID register gathers its items, adds one and makes one from the text", async ({ page }) => {
  await signIn(page);
  await explorer(page).getByLabel("Filter the explorer").fill("Claims Manager high-level design");
  await row(page, "Claims Manager high-level design").dblclick();
  const raid = section(page, "RAID");
  const completeness = page.getByRole("button", { name: /sections complete/ });
  await expect(completeness).toHaveText("6 of 6 sections complete");

  // Mentioned in the notes, about the subject, and about an element its context shows.
  const risks = raid.getByRole("table", { name: "Risks" });
  await expect(risks.getByRole("row", { name: /Nightly SFTP feed has no retry/ })).toContainText(
    "mentioned, about Legacy CRM",
  );
  await expect(raid.getByRole("table", { name: "Issues" })).toContainText("about Claims Manager");
  await expect(raid.getByRole("table", { name: "Dependencies" })).toContainText("about Payments Hub");
  await expect(risks.getByLabel("Impact of Nightly SFTP feed has no retry")).toHaveValue("medium");

  // + Add: an open assumption about Claims Manager, which asks for an owner.
  await raid.getByRole("button", { name: "+ Add RAID item" }).click();
  await raid.getByLabel("Kind of item").selectOption({ label: "Assumption" });
  await raid.getByLabel("Name of the new item").fill("Claims stay under 500 a day");
  await raid.getByLabel("Name of the new item").press("Enter");
  const assumptions = raid.getByRole("table", { name: "Assumptions" });
  await expect(assumptions.getByLabel("Status of Claims stay under 500 a day")).toHaveValue("open");
  await expect(completeness).toHaveText("5 of 6 sections complete");
  await completeness.click();
  await expect(page.getByRole("list", { name: "What is missing" })).toContainText(
    "RAID: Claims stay under 500 a day has no owner",
  );
  await assumptions.getByLabel("Owner of Claims stay under 500 a day").fill("dana@example.com");
  await assumptions.getByLabel("Owner of Claims stay under 500 a day").press("Enter");
  await expect(completeness).toHaveText("6 of 6 sections complete");

  // Make RAID item: a sentence of the notes becomes an issue, mentioned where it was written.
  const notes = section(page, "Notes");
  await notes.getByRole("button", { name: "Edit" }).click();
  const text = notes.getByRole("textbox", { name: "Notes" });
  await text.press("ControlOrMeta+End");
  await text.pressSequentially("\n\nThe audit trail misses manual payments");
  await text.press("Shift+Home");
  await notes.getByRole("group", { name: "Make RAID item" }).getByRole("button", { name: "Issue" }).click();
  await expect(text).toHaveValue(/@\[The audit trail misses manual payments\]\([^)]+\)$/);
  await page.getByRole("heading", { name: "Claims Manager high-level design" }).click(); // away: saves
  await expect(notes.getByRole("button", { name: "The audit trail misses manual payments" })).toBeVisible();
  await expect(
    raid.getByRole("table", { name: "Issues" }).getByRole("row", { name: /The audit trail misses manual payments/ }),
  ).toContainText("mentioned, about Claims Manager");
  await saved(page);

  // The items are ordinary elements: deleting one takes it out of the register.
  await deleteObject(page, "Claims stay under 500 a day");
  await expect(raid.getByRole("table", { name: "Assumptions" })).toHaveCount(0);
  await deleteObject(page, "The audit trail misses manual payments");
  await expect(raid).not.toContainText("The audit trail misses manual payments");
  await saved(page);
});
