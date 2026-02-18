import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, chromium, type BrowserContext, type Page } from '@playwright/test';
import { AUTH_STATE_PATH } from './fixtures';

function isCalendarUrl(url: string): boolean {
  return (
    /calendar\.google\.com\/calendar\/u\/\d+\/r/.test(url) ||
    /calendar\.google\.com\/calendar/.test(url) ||
    /calendar\.google\.com$/.test(url)
  );
}

async function tryPageReady(page: Page): Promise<boolean> {
  if (page.isClosed()) {
    return false;
  }

  const url = page.url();
  if (!isCalendarUrl(url)) {
    return false;
  }

  await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
  return true;
}

async function waitForCalendarReady(context: BrowserContext): Promise<Page> {
  const deadline = Date.now() + 15 * 60 * 1000;

  while (Date.now() < deadline) {
    const pages = context.pages().filter((page) => !page.isClosed());

    for (const page of pages) {
      if (await tryPageReady(page)) {
        return page;
      }
    }

    await Promise.race([
      context.waitForEvent('page', { timeout: 2000 }).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, 500))
    ]);
  }

  throw new Error('Timed out waiting for Google Calendar to be ready in any browser tab.');
}

test('bootstrap google calendar auth state', async () => {
  test.setTimeout(15 * 60 * 1000);

  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maw-auth-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled']
  });

  try {
    const initialPage = await context.newPage();
    await initialPage.goto('https://calendar.google.com/calendar/u/0/r', {
      waitUntil: 'domcontentloaded'
    });

    console.log('Complete Google login in the opened browser. You may switch tabs; auth is saved automatically once Calendar is ready.');
    const readyPage = await waitForCalendarReady(context);
    if (!readyPage.isClosed()) {
      await readyPage.bringToFront().catch(() => undefined);
    }
    await context.storageState({ path: AUTH_STATE_PATH });
    console.log(`Saved auth state to ${AUTH_STATE_PATH}`);
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
