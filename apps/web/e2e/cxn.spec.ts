// The CXN Builder, slice CXN-1 (design/02-model/views-and-design-artifacts.md §15): opened from the Tools menu,
// each pane filtered by a property value or by what it is related to, two rows linked at once and undone, hide
// connected, a drag that links, and the view saved with its filters. It removes the connections it makes.
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
const pane = (page: Page, side: "Source" | "Target") => page.getByRole("region", { name: `${side} pane` });
const rows = (page: Page, side: "Source" | "Target") => pane(page, side).getByRole("option").locator(".name");
const row = (page: Page, side: "Source" | "Target", name: string) =>
  pane(page, side)
    .getByRole("option")
    .filter({ has: page.locator(".name", { hasText: name }) });
const existing = (page: Page) => page.locator(".cxn-existing");

test("links two sets of elements from the Tools menu, filtered, undone, dragged and saved", async ({ page }) => {
  await signIn(page);
  await page.getByRole("menubar").getByRole("menuitem", { name: "Tools" }).click();
  await page.getByRole("menuitem", { name: "CXN Builder" }).click();
  await expect(page.getByRole("tab", { name: /CXN Builder \(unsaved\)/ })).toBeVisible();

  // Essentials' CXN Builder type: applications on the left, capabilities on the right, linked by Realizes.
  await expect(page.getByLabel("Connection type")).toHaveValue("type:realizes");
  await expect(existing(page)).toContainText("2 existing “Realizes” connections between these two sets");
  await expect(rows(page, "Source")).toHaveText(["Claims Manager", "Legacy CRM", "Payments Hub"]);

  // A property value, with its count, narrows the left pane.
  await pane(page, "Source").getByRole("button", { name: "+ Filter" }).click();
  await page
    .getByRole("dialog", { name: "Add a filter" })
    .getByRole("button", { name: /1 – poor\s*1/ })
    .click();
  await expect(rows(page, "Source")).toHaveText(["Legacy CRM"]);
  await expect(pane(page, "Source").locator(".chip")).toContainText(["Technical fit: 1 – poor"]);

  // What an element is related to narrows the right pane; its container stays as a heading.
  await pane(page, "Target").getByRole("button", { name: "+ Filter" }).click();
  await page.getByRole("dialog", { name: "Add a filter" }).getByRole("combobox").fill("Claims Man");
  await page.getByRole("option", { name: /Claims Manager/ }).click();
  await expect(rows(page, "Target")).toHaveText(["Claim Intake"]);
  await expect(pane(page, "Target").locator(".cxn-row.heading")).toHaveText(["Claims Management"]);
  await pane(page, "Target").getByRole("button", { name: "Remove filter Related to Claims Manager" }).click();
  await expect(rows(page, "Target")).toHaveText(["Claims Management", "Claim Intake", /^Claim /]);

  // Select one on the left and two on the right: Link 2 is one change, with Undo.
  await row(page, "Source", "Legacy CRM").click();
  await row(page, "Target", "Claim Intake").click();
  await row(page, "Target", "Claims Management").click();
  await page.getByRole("button", { name: "Link 2" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Link 2 as Realizes" })).toBeVisible();
  await expect(existing(page)).toContainText("2 existing");
  await expect(row(page, "Target", "Claim Intake").locator(".cxn-tick")).toHaveText("✓");
  await expect(page.locator(".cxn-wires > .wire")).toHaveCount(2);
  await page.screenshot({ path: "test-results/cxn-linked.png" });
  await saved(page);

  // Hide connected empties what is already linked to the left pane.
  await pane(page, "Target").getByLabel("Hide connected").check();
  await expect(rows(page, "Target")).toHaveText([/^Claim /]);
  await expect(pane(page, "Target")).toContainText("2 connected hidden");
  await pane(page, "Target").getByLabel("Hide connected").uncheck();

  await page
    .getByRole("status")
    .filter({ hasText: "Link 2 as Realizes" })
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(existing(page)).toContainText("No “Realizes” connections between these two sets yet");
  await saved(page);

  // Dragging a row onto a row of the other pane links them; Unlink takes it away again.
  await row(page, "Source", "Legacy CRM").dragTo(row(page, "Target", "Claim Intake"));
  await expect(existing(page)).toContainText("1 existing");
  await expect(page.getByRole("button", { name: "Unlink 1" })).toBeVisible();
  await page.getByRole("button", { name: "Unlink 1" }).click();
  await expect(existing(page)).toContainText("No “Realizes” connections");
  await saved(page);

  // Save view keeps the panes, filters included, as a view in the explorer.
  await page.getByRole("button", { name: "Save view" }).click();
  await expect(page.getByRole("tab", { name: /Application \(any\) → Capability/ })).toBeVisible();
  await saved(page);
  await page.reload();
  const repository = page.getByRole("button", { name: "Insurance Group EA", exact: true });
  await expect(page.getByTestId("save-state").or(repository)).toBeVisible();
  if (await repository.isVisible()) await repository.click();
  await saved(page);
  const explorer = page.getByRole("navigation", { name: "Explorer" });
  await explorer.getByLabel("Filter the explorer").fill("Application (any) → Capability");
  await explorer.locator(".row", { hasText: "Application (any) → Capability" }).dblclick();
  await expect(rows(page, "Source")).toHaveText(["Legacy CRM"]);
  await expect(pane(page, "Source").locator(".chip")).toContainText(["Technical fit: 1 – poor"]);
});

test("opens from an element's right-click menu with that element selected", async ({ page }) => {
  await signIn(page);
  const explorer = page.getByRole("navigation", { name: "Explorer" });
  await explorer.getByLabel("Filter the explorer").fill("Payments Hub");
  await explorer.locator(".row", { hasText: "Payments Hub" }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Connect in CXN Builder…" }).click();
  await expect(row(page, "Source", "Payments Hub")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".cxn-side").first()).toHaveText("Payments Hub");
});

test("wires in the gutter show what is connected, light up on hover and select a connection", async ({ page }) => {
  await signIn(page);
  await page.getByRole("menubar").getByRole("menuitem", { name: "Tools" }).click();
  await page.getByRole("menuitem", { name: "CXN Builder" }).click();
  await expect(existing(page)).toContainText("2 existing “Realizes” connections");
  const wires = page.locator(".cxn-wires > .wire");
  await expect(wires).toHaveCount(2);
  // Arrowheads say which way each connection runs: Realizes goes from application to capability, so swapping the
  // panes turns them round.
  await expect(wires.first()).toHaveAttribute("data-dir", "forward");
  await page.getByRole("button", { name: "Swap the panes" }).click();
  await expect(wires.first()).toHaveAttribute("data-dir", "back");
  await page.getByRole("button", { name: "Swap the panes" }).click();
  await expect(wires.first()).toHaveAttribute("data-dir", "forward");

  // Hovering a row lights up its partners on the other side and its wires.
  const source = page.locator(".cxn-row", { has: page.locator(".name", { hasText: "Claims Manager" }) }).first();
  await source.hover();
  const hot = pane(page, "Target").locator(".cxn-row.hot");
  await expect(hot).not.toHaveCount(0);
  await expect(page.locator(".cxn-wires > .wire.strong")).toHaveCount(await hot.count());
  await page.locator(".cxn-view").screenshot({ path: "test-results/cxn-wires.png" });

  // A wire's node selects both its rows.
  await page.mouse.move(0, 0);
  await wires.first().locator(".node").click();
  await expect(pane(page, "Source").locator('[aria-selected="true"]')).toHaveCount(1);
  await expect(pane(page, "Target").locator('[aria-selected="true"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Unlink 1" })).toBeVisible();
});
