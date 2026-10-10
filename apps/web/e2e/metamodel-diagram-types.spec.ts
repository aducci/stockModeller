// Diagram types admin, slice U-3: the types by kind, a type in use keeps its kind, taking an element type away
// from a type lists what diagrams still show of it, and a duplicated type with its own notation is published and
// offered in the New diagram dialog. The type it adds stays (later specs do not count types); its diagram goes.
import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 1000 } });

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Workspace").fill("W-DEV");
  await page.getByLabel("Email").fill("dana@example.com");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Insurance Group EA" }).click();
  await saved(page);
}

const saved = (page: Page) => expect(page.getByTestId("save-state")).toHaveText("All changes saved");
const explorer = (page: Page) => page.getByRole("navigation", { name: "Explorer" });
const list = (page: Page) => page.getByRole("navigation", { name: "Diagram types" });
const editor = (page: Page, name: string) => page.getByRole("region", { name: `Diagram type ${name}` });
const pending = (page: Page) => page.getByRole("region", { name: "Unpublished changes" });

test("duplicates a diagram type, gives it its own notation, and publishes it for everyone to use", async ({ page }) => {
  await signIn(page);
  await page.getByRole("menubar").getByRole("menuitem", { name: "Metamodel", exact: true }).click();
  await page.getByRole("menuitem", { name: "Diagram types", exact: true }).click();
  await expect(list(page).locator("h3")).toHaveText([
    "⧉ Diagrams",
    "▦ Matrices",
    "▤ Documents",
    "⇅ Sequences",
    "⇄ CXN Builders",
  ]);

  // The context diagram is in use: its kind is fixed.
  await list(page)
    .getByRole("button", { name: /^Context diagram/ })
    .click();
  const context = editor(page, "Context diagram");
  await expect(context.getByLabel("Kind")).toBeDisabled();

  // Taking data objects away from it: the review lists what the demo context still shows of them.
  await context.getByRole("checkbox", { name: "Data object", exact: true }).uncheck();
  await pending(page).getByRole("button", { name: "Review and publish…" }).click();
  const review = page.getByRole("dialog", { name: "Publish the metamodel" });
  await expect(review).toContainText("Diagram types changed (1)");
  await expect(review.getByRole("list", { name: "Drawn but no longer allowed" })).toContainText(
    "Context diagram · Data object",
  );
  await review.getByRole("button", { name: "Cancel" }).click();
  await context.getByRole("checkbox", { name: "Data object", exact: true }).check();
  await expect(pending(page)).toHaveCount(0);

  // A document type only says what it describes (views §13): no canvas settings.
  await list(page)
    .getByRole("button", { name: /^High-level design/ })
    .click();
  const hld = editor(page, "High-level design");
  const describes = hld.getByRole("group", { name: "Describes" });
  await expect(describes.getByRole("checkbox", { name: "Application (any)", exact: true })).toBeChecked();
  await expect(hld.getByRole("group", { name: "Elements it can show" })).toHaveCount(0);
  await expect(hld.getByRole("group", { name: "About an element" })).toHaveCount(0);
  await describes.getByRole("checkbox", { name: "Interface", exact: true }).check();
  await expect(pending(page)).toHaveCount(1);
  await describes.getByRole("checkbox", { name: "Interface", exact: true }).uncheck();
  await expect(pending(page)).toHaveCount(0);
  await list(page)
    .getByRole("button", { name: /^Context diagram/ })
    .click();

  // A copy with its own name and notation.
  await context.getByRole("button", { name: "Duplicate" }).click();
  const copy = editor(page, "Context diagram copy");
  await copy.getByLabel("Name").fill("Data flow map");
  const map = editor(page, "Data flow map");
  await expect(map.getByLabel("Kind")).toBeEnabled();
  await map.getByRole("tab", { name: "Notation" }).click();
  await map.getByLabel("Shape of Application").selectOption("hexagon");
  await expect(list(page).getByRole("button", { name: /^Data flow map/ })).toContainText("new");

  await pending(page).getByRole("button", { name: "Review and publish…" }).click();
  await expect(review).toContainText("Diagram types added (1)");
  await expect(review).toContainText("Data flow map");
  await review.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Published metamodel/ })).toBeVisible();
  await expect(pending(page)).toHaveCount(0);

  // The New diagram dialog offers it with the canvases.
  await explorer(page).getByRole("button", { name: "+ Diagram" }).click();
  const dialog = page.getByRole("dialog", { name: "New diagram" });
  await dialog
    .getByRole("group", { name: /Diagrams/ })
    .getByRole("radio", { name: "Data flow map" })
    .check();
  await dialog.getByLabel("Diagram name").fill("Flows of claims");
  await dialog.getByLabel("Diagram name").press("Enter");
  await expect(page.getByRole("tab", { name: /Flows of claims/ })).toBeVisible();
  await saved(page);

  await explorer(page).getByLabel("Filter the explorer").fill("Flows of claims");
  await explorer(page).locator(".row", { hasText: "Flows of claims" }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete diagram", exact: true }).click();
  await saved(page);
});
