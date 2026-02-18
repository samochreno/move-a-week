import { test, type Page } from '@playwright/test';
import {
  FIXTURES,
  assertShiftedByExactlyOneWeek,
  assertTimesUnchanged,
  clickShiftButton,
  ensureAuthStateExists,
  expectShiftButtonVisibleOnce,
  openItemBySearch,
  readPopupSnapshot,
  dismissOverlays,
  withCalendarPage
} from './fixtures';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  ensureAuthStateExists();
});

async function runShiftScenario(
  page: Page,
  title: string,
  expectTimeUnchanged: boolean
): Promise<void> {
  await openItemBySearch(page, title);
  await expectShiftButtonVisibleOnce(page);
  const before = await readPopupSnapshot(page);

  await clickShiftButton(page);
  await dismissOverlays(page);

  await openItemBySearch(page, title);
  await expectShiftButtonVisibleOnce(page);
  const after = await readPopupSnapshot(page);

  assertShiftedByExactlyOneWeek(before, after);
  if (expectTimeUnchanged) {
    assertTimesUnchanged(before, after);
  }
}

test('injects +1 week button exactly once for focused item', async () => {
  const fixture = FIXTURES.timedEvent;
  test.skip(!fixture, 'Set MAW_TIMED_EVENT_TITLE to run this test');
  if (!fixture) {
    return;
  }

  await withCalendarPage(async (page) => {
    await openItemBySearch(page, fixture.title);
    await expectShiftButtonVisibleOnce(page);

    await dismissOverlays(page);
    await openItemBySearch(page, fixture.title);
    await expectShiftButtonVisibleOnce(page);
  });
});

test('shifts timed event by 7 days and keeps time', async () => {
  const fixture = FIXTURES.timedEvent;
  test.skip(!fixture, 'Set MAW_TIMED_EVENT_TITLE');
  if (!fixture) {
    return;
  }

  await withCalendarPage(async (page) => {
    await runShiftScenario(page, fixture.title, true);
  });
});

test('shifts all-day event by 7 days', async () => {
  const fixture = FIXTURES.allDayEvent;
  test.skip(!fixture, 'Set MAW_ALL_DAY_EVENT_TITLE');
  if (!fixture) {
    return;
  }

  await withCalendarPage(async (page) => {
    await runShiftScenario(page, fixture.title, false);
  });
});

test('shifts recurring event occurrence by 7 days', async () => {
  const fixture = FIXTURES.recurringEvent;
  test.skip(!fixture, 'Set MAW_RECURRING_EVENT_TITLE');
  if (!fixture) {
    return;
  }

  await withCalendarPage(async (page) => {
    await runShiftScenario(page, fixture.title, true);
  });
});

test('shifts task with time by 7 days and keeps time', async () => {
  const fixture = FIXTURES.taskWithTime;
  test.skip(!fixture, 'Set MAW_TASK_WITH_TIME_TITLE');
  if (!fixture) {
    return;
  }

  await withCalendarPage(async (page) => {
    await runShiftScenario(page, fixture.title, true);
  });
});

test('shifts task without time by 7 days', async () => {
  const fixture = FIXTURES.taskNoTime;
  test.skip(!fixture, 'Set MAW_TASK_NO_TIME_TITLE');
  if (!fixture) {
    return;
  }

  await withCalendarPage(async (page) => {
    await runShiftScenario(page, fixture.title, false);
  });
});
