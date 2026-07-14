import { expect, test, type Page } from "@playwright/test";

function collectConsoleFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      failures.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

async function openMockVault(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("treeitem", { name: "Home", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator('main [contenteditable="true"]')).toBeVisible();
}

test("creates a page with title focus, enters the editor, and confirms autosave", async ({
  page,
}) => {
  const consoleFailures = collectConsoleFailures(page);
  await openMockVault(page);

  await page.getByRole("button", { name: "New page", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Untitled", exact: true });
  await expect(title).toBeFocused();
  await title.press("Enter");

  const editor = page.locator('main [contenteditable="true"]');
  await expect(editor).toBeFocused();
  await editor.type("Reliable local note");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 2_500 });
  expect(consoleFailures).toEqual([]);
});

test("supports keyboard tree navigation and expansion", async ({ page }) => {
  const consoleFailures = collectConsoleFailures(page);
  await openMockVault(page);

  const home = page.getByRole("treeitem", { name: "Home", exact: true });
  await home.focus();
  await home.press("ArrowDown");
  const projects = page.getByRole("treeitem", { name: "Projects", exact: true });
  await expect(projects).toBeFocused();
  await projects.press("ArrowRight");
  await expect(projects).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("treeitem", { name: "Roadmap", exact: true })).toBeVisible();
  expect(consoleFailures).toEqual([]);
});

test("confirms deletion and closes the document only after backend success", async ({ page }) => {
  const consoleFailures = collectConsoleFailures(page);
  await openMockVault(page);

  await page.getByRole("button", { name: "Page options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Move to Trash", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Move this page to the Trash?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Home.md");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Untitled" })).toHaveValue("Home");

  await page.getByRole("button", { name: "Page options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Move to Trash", exact: true }).click();
  const confirmedDialog = page.getByRole("dialog", { name: "Move this page to the Trash?" });
  await confirmedDialog.getByRole("button", { name: "Move to Trash", exact: true }).click();
  await expect(page.getByRole("treeitem", { name: "Home", exact: true })).toHaveCount(0);
  await expect(page.getByText("Select a note in the sidebar, or create a new page.")).toBeVisible();
  expect(consoleFailures).toEqual([]);
});

test("recreates BlockNote with the Portuguese dictionary", async ({ page }) => {
  const consoleFailures = collectConsoleFailures(page);
  await openMockVault(page);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("menuitem", { name: "Português", exact: true }).click();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();

  const editor = page.locator('[data-editor-language="pt"] [contenteditable="true"]');
  await expect(editor).toBeVisible();
  await editor.click();
  await editor.type("/");
  await expect(page.getByText("Usado para um título de nível superior", { exact: true }))
    .toBeVisible();
  expect(consoleFailures).toEqual([]);
});

test("opens block actions from the drag handle and keeps every action functional", async ({
  page,
}) => {
  const consoleFailures = collectConsoleFailures(page);
  await openMockVault(page);

  const paragraph = page.locator(".bn-block-outer", { hasText: "Welcome." }).first();
  await paragraph.hover();
  await page.getByRole("button", { name: "Open block menu", exact: true }).click();

  await expect(page.getByRole("menuitem", { name: "Turn into", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Duplicate", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toBeVisible();

  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect(page.locator(".bn-block-outer", { hasText: "Welcome." })).toHaveCount(2);

  const duplicate = page.locator(".bn-block-outer", { hasText: "Welcome." }).last();
  await duplicate.hover();
  await page.getByRole("button", { name: "Open block menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Turn into", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Heading 2", exact: true }).click();
  await expect(duplicate.locator('[data-content-type="heading"]')).toHaveCount(1);

  await duplicate.hover();
  await page.getByRole("button", { name: "Open block menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(page.locator(".bn-block-outer", { hasText: "Welcome." })).toHaveCount(1);
  expect(consoleFailures).toEqual([]);
});

test("renders the formatting tooltip with a native attached arrow", async ({ page }) => {
  const consoleFailures = collectConsoleFailures(page);
  await openMockVault(page);

  await page.evaluate(() => {
    const inlineContent = document.querySelector(".bn-inline-content");
    const text = inlineContent?.firstChild;
    if (!(text instanceof Text)) throw new Error("Expected editable text");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, Math.min(7, text.length));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  const bold = page.getByRole("button", { name: "Bold", exact: true });
  await expect(bold).toBeVisible();
  await bold.hover();

  const tooltip = page.locator('[data-slot="tooltip-content"]', { hasText: "Bold" });
  await expect(tooltip).toBeVisible();
  const arrowStyles = await tooltip.locator("svg").evaluate((arrow) => {
    const style = getComputedStyle(arrow);
    return {
      backgroundColor: style.backgroundColor,
      transform: style.transform,
      width: style.width,
      height: style.height,
    };
  });
  expect(arrowStyles).toEqual({
    backgroundColor: "rgba(0, 0, 0, 0)",
    transform: "none",
    width: "10px",
    height: "5px",
  });
  expect(consoleFailures).toEqual([]);
});
