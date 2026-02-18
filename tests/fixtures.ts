import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, type Page } from '@playwright/test';
import { daysBetween, extractDatesFromText, extractTimesFromText } from '../src/date-utils';

export interface ScenarioFixture {
  title: string;
  hasTime: boolean;
}

export interface PopupSnapshot {
  line: string;
  dates: Date[];
  times: string[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '..');
export const AUTH_STATE_PATH = path.join(ROOT_DIR, 'tests', '.auth', 'google-calendar.json');
export const AUTH_PROFILE_DIR = path.join(ROOT_DIR, 'tests', '.auth', 'chrome-profile');

export const FIXTURES = {
  timedEvent: readScenario('MAW_TIMED_EVENT_TITLE', true),
  allDayEvent: readScenario('MAW_ALL_DAY_EVENT_TITLE', false),
  recurringEvent: readScenario('MAW_RECURRING_EVENT_TITLE', true),
  taskWithTime: readScenario('MAW_TASK_WITH_TIME_TITLE', true),
  taskNoTime: readScenario('MAW_TASK_NO_TIME_TITLE', false)
};

function readScenario(titleVar: string, hasTime: boolean): ScenarioFixture | null {
  const title = process.env[titleVar]?.trim();
  if (!title) {
    return null;
  }

  return {
    title,
    hasTime
  };
}

export function ensureAuthStateExists(): void {
  if (!fs.existsSync(AUTH_STATE_PATH)) {
    throw new Error(
      `Missing auth state at ${AUTH_STATE_PATH}. Run \"pnpm test:auth\" first and complete Google login.`
    );
  }
}

async function ensureMoveAWeekLoaded(page: Page): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-maw-loaded')), {
      timeout: 10000
    })
    .toBe('1');
}

export async function withCalendarPage(run: (page: Page) => Promise<void>): Promise<void> {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true
  });
  const context = await browser.newContext({
    storageState: AUTH_STATE_PATH
  });

  try {
    await context.addInitScript({ path: path.join(ROOT_DIR, 'dist', 'content.js') });
    const page = await context.newPage();
    await openCalendar(page);
    await ensureMoveAWeekLoaded(page);
    await run(page);
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function openCalendar(page: Page): Promise<void> {
  await page.goto('https://calendar.google.com/calendar/u/0/r', {
    waitUntil: 'domcontentloaded'
  });

  await expect
    .poll(
      async () => {
        const current = new URL(page.url());
        return `${current.hostname}${current.pathname}`;
      },
      { timeout: 15000 }
    )
    .toMatch(/^calendar\.google\.com\/calendar\//);
}

export async function dismissOverlays(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.keyboard.press('Escape').catch(() => undefined);
}

export async function openItemBySearch(page: Page, title: string): Promise<void> {
  await dismissOverlays(page);

  const directItem = page
    .locator('[role="button"], [role="link"], [data-eventid], [data-key]')
    .filter({ hasText: title })
    .first();
  if ((await directItem.count()) > 0) {
    await directItem.click({ timeout: 5000 }).catch(() => undefined);
    const dialog = page.locator('[role="dialog"]').filter({ hasText: title }).last();
    if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      return;
    }
  }

  const searchSelector =
    'input[type="search"]:visible, input[aria-label*="Search" i]:visible, input[placeholder*="Search" i]:visible, input[aria-label*="Hľada" i]:visible, input[placeholder*="Hľada" i]:visible';

  let searchInput = page
    .locator(searchSelector)
    .first();
  if ((await searchInput.count()) === 0) {
    await page.keyboard.press('/').catch(() => undefined);
    searchInput = page.locator(searchSelector).first();
  }

  if ((await searchInput.count()) === 0) {
    const searchButton = page
      .locator(
        'button[aria-label*="Search" i], [role="button"][aria-label*="Search" i], button[aria-label*="Hľada" i], [role="button"][aria-label*="Hľada" i]'
      )
      .first();
    if ((await searchButton.count()) > 0) {
      await searchButton.click({ timeout: 10000 });
    }
  }

  const hasVisibleSearchInput = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);
  if (hasVisibleSearchInput) {
    await searchInput.click();
    await searchInput.fill(title);
    await searchInput.press('Enter');
  } else {
    await page.keyboard.press('/').catch(() => undefined);
    await page.keyboard.type(title, { delay: 20 });
    await page.keyboard.press('Enter');
  }

  const result = page
    .locator('[role="button"], [role="link"], [data-eventid], [data-key]')
    .filter({ hasText: title })
    .first();

  await expect(result).toBeVisible({ timeout: 15000 });
  await result.click();
}

export async function expectShiftButtonVisibleOnce(page: Page): Promise<void> {
  const button = page.locator('.maw-shift-btn');
  await expect(button).toHaveCount(1, { timeout: 10000 });
  await expect(button.first()).toBeVisible();
}

export async function clickShiftButton(page: Page): Promise<void> {
  const button = page.locator('.maw-shift-btn').first();
  await expect(button).toBeVisible({ timeout: 10000 });
  await button.click();

  await expect
    .poll(
      async () => {
        const current = page.locator('.maw-shift-btn').first();
        const count = await current.count();
        if (count === 0) {
          return 'detached';
        }

        const text = (await current.textContent())?.trim() ?? '';
        return text || 'empty';
      },
      { timeout: 20000 }
    )
    .toMatch(/Done|Retry|\+1 week|detached/i);
}

export async function readPopupSnapshot(page: Page): Promise<PopupSnapshot> {
  const dialog = page.locator('[role="dialog"]').filter({ hasText: /January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec/i }).last();

  await expect(dialog).toBeVisible({ timeout: 10000 });
  const text = await dialog.innerText();

  const line = text
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => /January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec/i.test(entry));

  if (!line) {
    throw new Error(`Could not find a date line in popup text:\n${text}`);
  }

  return {
    line,
    dates: extractDatesFromText(line),
    times: extractTimesFromText(line)
  };
}

export function assertShiftedByExactlyOneWeek(before: PopupSnapshot, after: PopupSnapshot): void {
  const sharedLength = Math.min(before.dates.length, after.dates.length);
  if (sharedLength === 0) {
    throw new Error(`Unable to compare dates. Before: \"${before.line}\" | After: \"${after.line}\"`);
  }

  for (let index = 0; index < sharedLength; index += 1) {
    const diff = daysBetween(after.dates[index], before.dates[index]);
    expect(diff).toBe(7);
  }
}

export function assertTimesUnchanged(before: PopupSnapshot, after: PopupSnapshot): void {
  expect(after.times).toEqual(before.times);
}
