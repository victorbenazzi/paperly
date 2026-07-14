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
