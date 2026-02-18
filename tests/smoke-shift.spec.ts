import { test, expect, type Page } from '@playwright/test';
import {
  assertShiftedByExactlyOneWeek,
  assertTimesUnchanged,
  dismissOverlays,
  ensureAuthStateExists,
  openItemBySearch,
  readPopupSnapshot,
  withCalendarPage
} from './fixtures';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  ensureAuthStateExists();
});

function uniqueTitle(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

async function clickCreateMenuItem(page: Page, dataKey: string, label: string): Promise<void> {
  await dismissOverlays(page);
  await page
    .locator('button:has-text("Create"):visible, [role="button"]:has-text("Create"):visible')
    .first()
    .click({ timeout: 10000 });

  const menuItem = page
    .locator(
      `[role="menuitem"][data-key="${dataKey}"]:visible, [role="menuitem"]:has-text("${label}"):visible`
    )
    .first();
  if (await menuItem.isVisible({ timeout: 1500 }).catch(() => false)) {
    await menuItem.click();
    return;
  }

  const tab = page
    .locator(`button[role="tab"]:has-text("${label}"):visible, [role="tab"]:has-text("${label}"):visible`)
    .first();
  if (await tab.isVisible({ timeout: 4000 }).catch(() => false)) {
    await tab.click();
    return;
  }

  throw new Error(`Could not select create target "${label}"`);
}

async function createTimedTask(page: Page, title: string): Promise<void> {
  await clickCreateMenuItem(page, 'task_time_block', 'Task');
  await page
    .locator('input[aria-label="Add title"], input[placeholder="Add title"]')
    .first()
    .fill(title);

  await page
    .locator('[role="dialog"] button:has-text("Save"):visible, [role="dialog"] [role="button"]:has-text("Save"):visible')
    .last()
    .click({ timeout: 10000 });
  await page.waitForTimeout(1500);
}

async function createTimedEvent(page: Page, title: string): Promise<void> {
  await dismissOverlays(page);
  await page
    .locator('button:has-text("Create"):visible, [role="button"]:has-text("Create"):visible')
    .first()
    .click({ timeout: 10000 });

  const eventMenuItem = page
    .locator('[role="menuitem"][data-key="event"]:visible, [role="menuitem"]:has-text("Event"):visible')
    .first();
  if (await eventMenuItem.isVisible({ timeout: 1200 }).catch(() => false)) {
    await eventMenuItem.click();
  } else {
    const eventTab = page
      .locator('button[role="tab"]:has-text("Event"):visible, [role="tab"]:has-text("Event"):visible')
      .first();
    if (await eventTab.isVisible({ timeout: 1200 }).catch(() => false)) {
      await eventTab.click();
    }
  }

  await page
    .locator('input[aria-label="Add title"], input[placeholder="Add title"]')
    .first()
    .fill(title);

  const saveButton = page
    .locator(
      'button[aria-label="Save"]:visible, [role="button"][aria-label="Save"]:visible, button:has-text("Save"):visible, [role="button"]:has-text("Save"):visible'
    )
    .first();
  await expect(saveButton).toBeVisible({ timeout: 10000 });
  await saveButton.click();
  await page.waitForTimeout(1500);
}

async function runScenario(
  page: Page,
  title: string,
  expectTimeUnchanged: boolean,
  expectedKind: 'event' | 'task'
): Promise<void> {
  const visibleItemSelector = '[role="button"]:visible, [role="link"]:visible, [data-eventid]:visible, [data-key]:visible';

  async function openVisibleItemByTitle(): Promise<void> {
    const item = page.locator(visibleItemSelector).filter({ hasText: title }).first();
    await expect(item).toBeVisible({ timeout: 15000 });
    await item.click();
    await expect(page.locator('[role="dialog"]').filter({ hasText: title }).last()).toBeVisible({ timeout: 10000 });
  }

  async function ensureShiftButtonVisible(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const button = page.locator('.maw-shift-btn').first();
      if (await button.isVisible({ timeout: 1200 }).catch(() => false)) {
        return;
      }
      await openItemBySearch(page, title);
      await page.waitForTimeout(250);
    }
    throw new Error(`Shift button was not visible for "${title}"`);
  }

  await openItemBySearch(page, title);
  await ensureShiftButtonVisible();

  const firstDialogText = await page.locator('[role="dialog"]').last().innerText();
  const hasTaskSignals = /Mark completed|Add deadline/i.test(firstDialogText);
  if (expectedKind === 'task' && !hasTaskSignals) {
    throw new Error(`Expected task popup but got:\n${firstDialogText.slice(0, 400)}`);
  }

  const before = await readPopupSnapshot(page);

  let shiftButton = page.locator('.maw-shift-btn').first();
  const visibleNow = await shiftButton.isVisible({ timeout: 800 }).catch(() => false);
  if (!visibleNow) {
    await openItemBySearch(page, title);
    await ensureShiftButtonVisible();
    shiftButton = page.locator('.maw-shift-btn').first();
  }
  await shiftButton.click();
  await page.waitForTimeout(3200);

  await dismissOverlays(page);

  const shiftedItemVisibleNow = await page
    .locator(visibleItemSelector)
    .filter({ hasText: title })
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);
  if (!shiftedItemVisibleNow) {
    const nextWeek = page
      .locator('button[aria-label*="Next week" i], [role="button"][aria-label*="Next week" i]')
      .first();
    if (await nextWeek.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextWeek.click();
      await page.waitForTimeout(450);
    }
  }

  await openVisibleItemByTitle();
  await ensureShiftButtonVisible();
  const after = await readPopupSnapshot(page);
  console.log(`[smoke] ${title} before: ${before.line}`);
  console.log(`[smoke] ${title} after: ${after.line}`);

  assertShiftedByExactlyOneWeek(before, after);
  if (expectTimeUnchanged && before.times.length > 0) {
    assertTimesUnchanged(before, after);
  }
}

test('smoke: shifts a newly created timed task by 7 days', async () => {
  await withCalendarPage(async (page) => {
    const title = uniqueTitle('MAW_SMOKE_TASK');
    await createTimedTask(page, title);
    await runScenario(page, title, true, 'task');
  });
});

test('smoke: shifts a newly created timed event by 7 days', async () => {
  await withCalendarPage(async (page) => {
    const title = uniqueTitle('MAW_SMOKE_EVENT');
    await createTimedEvent(page, title);
    await runScenario(page, title, true, 'event');
  });
});
