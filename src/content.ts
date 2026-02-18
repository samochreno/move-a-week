import {
  CALENDAR_NEXT_MONTH_SELECTORS,
  CALENDAR_PREVIOUS_WEEK_SELECTORS,
  DATE_INPUT_SELECTORS,
  EVENT_EDIT_BUTTON_SELECTORS,
  ITEM_ROOT_SELECTORS,
  RECURRENCE_BUTTON_TEXT,
  SAVE_BUTTON_SELECTORS,
  TASK_DATE_TRIGGER_SELECTORS,
  TASK_EDIT_BUTTON_SELECTORS,
  findButtonByText,
  isElementVisible,
  queryAllVisible,
  queryFirstVisible
} from './dom-selectors';
import { addDays, daysBetween, looksLikeDateText, parseDateTime, shiftDateInputValue } from './date-utils';

export type ItemKind = 'event' | 'task';
export type DateShiftOutcome = 'success' | 'retryable-failure' | 'terminal-failure';

export interface ShiftActionContext {
  kind: ItemKind;
  root: HTMLElement;
}

export interface ShiftResult {
  outcome: DateShiftOutcome;
  reason?: string;
}

const SHIFT_DAYS = 7;
const BUTTON_CLASS = 'maw-shift-btn';
const ROOT_GUARD_ATTR = 'data-move-week-injected';
const DEBOUNCE_MS = 150;
let scanTimer: number | null = null;

function bootstrap(): void {
  document.documentElement.setAttribute('data-maw-loaded', '1');

  const observer = new MutationObserver(() => {
    if (scanTimer) {
      window.clearTimeout(scanTimer);
    }

    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      scanAndInjectButtons();
    }, DEBOUNCE_MS);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  scanAndInjectButtons();
}

function scanAndInjectButtons(): void {
  const roots = findItemRoots();

  for (const root of roots) {
    if (root.getAttribute(ROOT_GUARD_ATTR) === '1' && root.querySelector(`.${BUTTON_CLASS}`)) {
      continue;
    }
    root.removeAttribute(ROOT_GUARD_ATTR);

    const kind = classifyItem(root);
    if (!kind) {
      continue;
    }

    const editButton = findEditButton(root, kind);
    if (!editButton) {
      continue;
    }

    const actionRow = editButton.parentElement;
    if (!actionRow) {
      continue;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.textContent = '+1 week';
    button.setAttribute('aria-label', 'Move by one week');

    button.addEventListener('click', async () => {
      const context: ShiftActionContext = {
        kind: classifyItem(root) ?? kind,
        root
      };

      const result = await runShiftFlow(button, context);
      showResult(button, result);
    });

    actionRow.insertAdjacentElement('afterend', button);
    root.setAttribute(ROOT_GUARD_ATTR, '1');
  }
}

function findItemRoots(): HTMLElement[] {
  const candidates = new Set<HTMLElement>();

  for (const selector of ITEM_ROOT_SELECTORS) {
    document.querySelectorAll(selector).forEach((match) => {
      if (isElementVisible(match)) {
        candidates.add(match as HTMLElement);
      }
    });
  }

  return Array.from(candidates);
}

function classifyItem(root: HTMLElement): ItemKind | null {
  const text = root.innerText.toLowerCase();
  if (root.querySelector('button[aria-label="Edit task"], [role="button"][aria-label="Edit task"]')) {
    return 'task';
  }

  if (root.querySelector('button[aria-label="Edit event"], [role="button"][aria-label="Edit event"]')) {
    return 'event';
  }

  if (text.includes('mark completed') || text.includes('task details') || text.includes('add deadline')) {
    return 'task';
  }

  if (text.includes('guests') || text.includes('find a time') || text.includes('event details')) {
    return 'event';
  }

  if (findEditButton(root, 'event')) {
    return 'event';
  }

  return 'event';
}

function findEditButton(root: ParentNode, kind: ItemKind): HTMLElement | null {
  const selectors = kind === 'task' ? TASK_EDIT_BUTTON_SELECTORS : EVENT_EDIT_BUTTON_SELECTORS;
  const bySelector = queryFirstVisible(root, selectors);
  if (bySelector) {
    return bySelector;
  }

  return findButtonByText(root, ['Edit', 'Edit event', 'Edit task']);
}

function setBusyState(button: HTMLButtonElement, busy: boolean): void {
  button.disabled = busy;
  button.setAttribute('data-busy', busy ? '1' : '0');
  button.textContent = busy ? 'Shifting...' : '+1 week';
}

function showResult(button: HTMLButtonElement, result: ShiftResult): void {
  if (result.outcome === 'success') {
    button.textContent = 'Done';
    button.setAttribute('data-status', 'success');
  } else {
    button.textContent = 'Retry';
    button.setAttribute('data-status', 'error');
  }

  window.setTimeout(() => {
    button.textContent = '+1 week';
    button.removeAttribute('data-status');
  }, 2000);
}

async function runShiftFlow(button: HTMLButtonElement, context: ShiftActionContext): Promise<ShiftResult> {
  try {
    setBusyState(button, true);
    const initialDateKey = context.kind === 'task' ? getVisibleAnchorDateKey() : null;

    const clickedEdit = await clickWithRetry(() => findEditButton(context.root, context.kind), 3);
    if (!clickedEdit) {
      return {
        outcome: 'retryable-failure',
        reason: 'Could not click edit button'
      };
    }

    const editorRoot = await waitForEditorSurface(context.kind, 10000);
    if (!editorRoot) {
      return {
        outcome: 'retryable-failure',
        reason: 'Editor surface not found'
      };
    }

    const changedInputs = await shiftDateInputs(editorRoot, context.kind);
    if (changedInputs === 0) {
      return {
        outcome: 'terminal-failure',
        reason: 'No date inputs changed'
      };
    }

    if (context.kind === 'task') {
      await wait(300);
    }

    const saved = await clickSave(editorRoot);
    if (!saved) {
      return {
        outcome: 'retryable-failure',
        reason: 'Save action failed'
      };
    }

    if (context.kind === 'event') {
      await maybeHandleRecurringPrompt();
    } else {
      void restoreViewportIfWeekShifted(initialDateKey);
    }
    return {
      outcome: 'success'
    };
  } catch (error) {
    return {
      outcome: 'terminal-failure',
      reason: error instanceof Error ? error.message : String(error)
    };
  } finally {
    setBusyState(button, false);
  }
}

function getVisibleAnchorDateKey(): number | null {
  const weekGridKeys = Array.from(
    document.querySelectorAll<HTMLElement>('[role="gridcell"][data-datekey], [data-datekey][role="gridcell"]')
  )
    .filter((element) => isElementVisible(element))
    .map((element) => Number(element.getAttribute('data-datekey')))
    .filter((value) => Number.isFinite(value));

  if (weekGridKeys.length > 0) {
    return Math.min(...weekGridKeys);
  }

  const fallbackKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-datekey]'))
    .filter((element) => isElementVisible(element))
    .map((element) => Number(element.getAttribute('data-datekey')))
    .filter((value) => Number.isFinite(value));

  if (fallbackKeys.length === 0) {
    return null;
  }

  return Math.min(...fallbackKeys);
}

function findPreviousWeekButton(): HTMLElement | null {
  const explicit = queryFirstVisible(document, CALENDAR_PREVIOUS_WEEK_SELECTORS);
  if (explicit) {
    return explicit;
  }

  const fallback = Array.from(document.querySelectorAll<HTMLElement>('button[jsname="VfNHU"], [role="button"][jsname="VfNHU"]'))
    .filter((element) => isElementVisible(element))
    .find((element) => Boolean(element.closest('header, [role="banner"]')));

  return fallback ?? null;
}

async function restoreViewportIfWeekShifted(initialDateKey: number | null): Promise<void> {
  if (initialDateKey === null) {
    return;
  }

  // Task save can auto-navigate to the shifted task week several seconds later.
  const observeDeadline = Date.now() + 9000;
  let cancelledByUser = false;
  const cancel = () => {
    cancelledByUser = true;
  };
  window.addEventListener('pointerdown', cancel, { capture: true });
  window.addEventListener('keydown', cancel, { capture: true });
  window.addEventListener('wheel', cancel, { capture: true });

  while (Date.now() < observeDeadline) {
    if (cancelledByUser) {
      window.removeEventListener('pointerdown', cancel, { capture: true });
      window.removeEventListener('keydown', cancel, { capture: true });
      window.removeEventListener('wheel', cancel, { capture: true });
      return;
    }

    const currentKey = getVisibleAnchorDateKey();
    if (currentKey === null) {
      await wait(70);
      continue;
    }

    const diff = currentKey - initialDateKey;
    if (diff >= 7) {
      const previousWeekButton = findPreviousWeekButton();
      if (!previousWeekButton) {
        return;
      }

      const steps = Math.max(1, Math.min(4, Math.round(diff / 7)));
      for (let index = 0; index < steps; index += 1) {
        previousWeekButton.click();
        await wait(90);
      }
      window.removeEventListener('pointerdown', cancel, { capture: true });
      window.removeEventListener('keydown', cancel, { capture: true });
      window.removeEventListener('wheel', cancel, { capture: true });
      return;
    }

    await wait(70);
  }

  window.removeEventListener('pointerdown', cancel, { capture: true });
  window.removeEventListener('keydown', cancel, { capture: true });
  window.removeEventListener('wheel', cancel, { capture: true });
}

export async function waitForElement(selectors: string[], timeoutMs: number): Promise<HTMLElement | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const candidate = queryFirstVisible(document, selectors);
    if (candidate) {
      return candidate;
    }

    await wait(100);
  }

  return null;
}

export async function clickWithRetry(locatorStrategy: () => HTMLElement | null, attempts: number): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const element = locatorStrategy();
    if (element && isElementVisible(element)) {
      element.click();
      return true;
    }

    await wait(200);
  }

  return false;
}

export function setInputValueAndDispatch(input: HTMLInputElement, value: string): void {
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.blur();
}

function hasLikelyDateControls(root: HTMLElement, kind: ItemKind): boolean {
  const dateInput = queryFirstVisible(root, DATE_INPUT_SELECTORS);
  if (dateInput) {
    return true;
  }

  if (kind === 'task') {
    const taskDateTrigger = findTaskDateTrigger(root);
    return Boolean(taskDateTrigger);
  }

  return false;
}

async function waitForEditorSurface(kind: ItemKind, timeoutMs: number): Promise<HTMLElement | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const dialogs = queryAllVisible(document, ['[role="dialog"]']);
    if (kind === 'task') {
      const taskDialog = dialogs.find(
        (dialog) => dialog.innerText.toLowerCase().includes('save') && hasLikelyDateControls(dialog, 'task')
      );
      if (taskDialog) {
        return taskDialog;
      }
    }

    const eventEditor = queryFirstVisible(document, ['main', '[role="main"]']);
    const isEventEditPath = window.location.pathname.includes('/eventedit');
    if (kind === 'event' && eventEditor && isEventEditPath && hasLikelyDateControls(eventEditor, 'event')) {
      return eventEditor;
    }

    const fallbackDialog = dialogs.find((dialog) => dialog.querySelector('input'));
    if (fallbackDialog) {
      return fallbackDialog;
    }

    await wait(120);
  }

  return null;
}

function maybeOpenDateControls(editorRoot: HTMLElement, kind: ItemKind): void {
  if (kind !== 'task') {
    return;
  }

  const trigger = findTaskDateTrigger(editorRoot);
  if (trigger) {
    trigger.click();
    return;
  }

  const fallback = queryAllVisible(editorRoot, ['button', '[role="button"]']).find((element) =>
    /january|february|march|april|may|june|july|august|september|october|november|december/i.test(
      element.textContent || ''
    )
  );
  if (fallback) {
    fallback.click();
  }
}

function findTaskDateTrigger(editorRoot: HTMLElement): HTMLElement | null {
  const selectorCandidates = queryAllVisible(editorRoot, TASK_DATE_TRIGGER_SELECTORS);
  const genericCandidates = queryAllVisible(editorRoot, ['button', '[role="button"]']);
  const candidates = Array.from(new Set([...selectorCandidates, ...genericCandidates]));
  if (candidates.length === 0) {
    return null;
  }

  const byDateText = candidates.find((element) => {
    const label = `${element.getAttribute('aria-label') || ''} ${element.textContent || ''}`.trim();
    if (!looksLikeDateText(label)) {
      return false;
    }

    const lowered = label.toLowerCase();
    return !lowered.includes('save') && !lowered.includes('close');
  });
  if (byDateText) {
    return byDateText;
  }

  const byTimeText = candidates.find((element) => {
    const label = `${element.getAttribute('aria-label') || ''} ${element.textContent || ''}`.toLowerCase();
    return /\b\d{1,2}(?::\d{2})?\s?(am|pm)\b/.test(label) || label.includes('date and time');
  });
  if (byTimeText) {
    return byTimeText;
  }

  const byDateAncestor = Array.from(editorRoot.querySelectorAll<HTMLElement>('*'))
    .filter((element) => isElementVisible(element))
    .find((element) => looksLikeDateText((element.textContent || '').trim()));
  if (byDateAncestor) {
    const clickable = byDateAncestor.closest<HTMLElement>('button, [role="button"]');
    if (clickable && isElementVisible(clickable)) {
      return clickable;
    }
  }

  return selectorCandidates[0] ?? candidates[0] ?? null;
}

function parseFirstDateFromText(text: string): Date | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const parsed = parseDateTime(line);
    if (parsed) {
      return parsed.date;
    }
  }

  return null;
}

function getTaskDisplayedDate(editorRoot: HTMLElement): Date | null {
  const trigger = findTaskDateTrigger(editorRoot);
  if (!trigger) {
    return null;
  }

  const label = [trigger.getAttribute('aria-label') || '', trigger.textContent || '']
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const parsed = parseDateTime(label);
  if (parsed) {
    return parsed.date;
  }

  return parseFirstDateFromText(label);
}

function findTaskDateInput(editorRoot: HTMLElement): HTMLInputElement | null {
  const explicitDateInputs = Array.from(
    editorRoot.querySelectorAll<HTMLInputElement>('input[aria-label*="Start date" i], input[aria-label*="date" i]')
  );
  const visibleExplicit = explicitDateInputs.find((input) => isElementVisible(input) && looksLikeDateText(input.value));
  if (visibleExplicit) {
    return visibleExplicit;
  }

  const anyExplicit = explicitDateInputs.find((input) => looksLikeDateText(input.value));
  if (anyExplicit) {
    return anyExplicit;
  }

  const inputs = queryAllVisible(editorRoot, DATE_INPUT_SELECTORS)
    .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement)
    .filter((input) => looksLikeDateText(input.value));

  const startDateInput = inputs.find((input) => /start date/i.test(input.getAttribute('aria-label') || ''));
  if (startDateInput) {
    return startDateInput;
  }

  return inputs[0] ?? null;
}

async function shiftTaskDateViaDirectInput(editorRoot: HTMLElement): Promise<boolean> {
  maybeOpenDateControls(editorRoot, 'task');
  await wait(140);

  const input = findTaskDateInput(editorRoot);
  if (!input) {
    return false;
  }

  const before = parseDateTime(input.value);
  if (!before) {
    return false;
  }

  const shifted = shiftDateInputValue(input.value, SHIFT_DAYS);
  if (!shifted || shifted === input.value) {
    return false;
  }

  setInputValueAndDispatch(input, shifted);
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true
    })
  );
  input.dispatchEvent(
    new KeyboardEvent('keyup', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true
    })
  );

  await wait(150);

  const after = parseDateTime(input.value);
  return Boolean(after && daysBetween(after.date, before.date) === SHIFT_DAYS);
}

function findTaskDatePickerRoot(editorRoot: HTMLElement): HTMLElement | null {
  const dialogs = queryAllVisible(document, ['[role="dialog"]']);
  for (let index = dialogs.length - 1; index >= 0; index -= 1) {
    const dialog = dialogs[index];
    if (dialog === editorRoot) {
      continue;
    }

    const hasGrid = Boolean(dialog.querySelector('[role="grid"], [role="gridcell"]'));
    const hasMonthNav = Boolean(queryFirstVisible(dialog, CALENDAR_NEXT_MONTH_SELECTORS));
    if (hasGrid || hasMonthNav) {
      return dialog;
    }
  }

  const inlineGrid = queryFirstVisible(editorRoot, ['[role="grid"]']);
  if (inlineGrid) {
    return editorRoot;
  }

  const floatingGrid = Array.from(document.querySelectorAll<HTMLElement>('[role="grid"]'))
    .filter((element) => isElementVisible(element))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 180 || rect.width > 560 || rect.height < 180 || rect.height > 640) {
        return false;
      }

      const cells = element.querySelectorAll('[role="gridcell"], button, [role="button"]').length;
      return cells >= 20;
    })
    .sort((left, right) => {
      const leftZ = Number.parseInt(window.getComputedStyle(left).zIndex || '0', 10);
      const rightZ = Number.parseInt(window.getComputedStyle(right).zIndex || '0', 10);
      return (Number.isFinite(rightZ) ? rightZ : 0) - (Number.isFinite(leftZ) ? leftZ : 0);
    })[0];

  if (floatingGrid) {
    return floatingGrid;
  }

  return null;
}

function selectDateFromPicker(root: ParentNode, target: Date): boolean {
  const monthLong = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(target);
  const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(target);
  const day = target.getDate();
  const year = target.getFullYear();
  const exactLabelOptions = [
    new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(target),
    new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(target),
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(target)
  ].map((value) => value.toLowerCase());

  const dateGrid = (root as HTMLElement).querySelector?.('[role="grid"]') ?? root;
  const allButtons = Array.from(
    dateGrid.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([aria-disabled="true"]), [role="button"]:not([aria-disabled="true"]), [role="gridcell"]:not([aria-disabled="true"])'
    )
  ).filter((element) => isElementVisible(element));

  const targetButton = allButtons.find((button) => {
    const label = [button.getAttribute('aria-label') || '', button.textContent || '']
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!label) {
      return false;
    }

    const normalized = label.toLowerCase();
    if (exactLabelOptions.some((exact) => normalized.includes(exact))) {
      return true;
    }

    if (normalized.includes(String(year))) {
      const hasMonthWithYear =
        normalized.includes(monthLong.toLowerCase()) || normalized.includes(monthShort.toLowerCase());
      const hasDayWithYear = new RegExp(`\\b${day}\\b`).test(normalized);
      if (hasMonthWithYear && hasDayWithYear) {
        return true;
      }
    }

    const hasMonth = label.toLowerCase().includes(monthLong.toLowerCase()) || label.toLowerCase().includes(monthShort.toLowerCase());
    const hasDay = new RegExp(`\\b${day}\\b`).test(label);
    return hasMonth && hasDay;
  });

  if (targetButton) {
    const clickTarget =
      targetButton.matches('[role="gridcell"]') && targetButton.querySelector<HTMLElement>('button, [role="button"]')
        ? (targetButton.querySelector<HTMLElement>('button, [role="button"]') as HTMLElement)
        : targetButton;

    dispatchCalendarDayClick(clickTarget);
    return true;
  }

  return false;
}

async function pickTaskDateWithRetry(editorRoot: HTMLElement, pickerRoot: HTMLElement, target: Date): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!selectDateFromPicker(pickerRoot, target)) {
      return false;
    }

    await wait(140);

    const displayedDate = getTaskDisplayedDate(editorRoot);
    if (displayedDate && daysBetween(displayedDate, target) === 0) {
      return true;
    }

    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          cancelable: true
        })
      );
      active.dispatchEvent(
        new KeyboardEvent('keyup', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true
        })
      );
      await wait(90);
      const afterEnterDate = getTaskDisplayedDate(editorRoot);
      if (afterEnterDate && daysBetween(afterEnterDate, target) === 0) {
        return true;
      }
    }
  }

  return false;
}

function dispatchCalendarDayClick(target: HTMLElement): void {
  const rect = target.getBoundingClientRect();
  const eventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    buttons: 1,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2
  };

  try {
    target.dispatchEvent(
      new PointerEvent('pointerdown', {
        ...eventInit,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
      })
    );
  } catch {
    // PointerEvent can fail in older contexts; mouse events below still run.
  }

  target.dispatchEvent(new MouseEvent('mousedown', eventInit));
  target.dispatchEvent(new MouseEvent('mouseup', { ...eventInit, buttons: 0 }));

  try {
    target.dispatchEvent(
      new PointerEvent('pointerup', {
        ...eventInit,
        buttons: 0,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
      })
    );
  } catch {
    // PointerEvent can fail in older contexts; click below still runs.
  }

  target.click();
}

async function shiftTaskDateViaPicker(editorRoot: HTMLElement, sourceDate: Date): Promise<boolean> {
  const target = addDays(sourceDate, SHIFT_DAYS);

  maybeOpenDateControls(editorRoot, 'task');
  await wait(1000);
  const pickerRoot = findTaskDatePickerRoot(editorRoot);
  if (!pickerRoot) {
    return false;
  }

  if (await pickTaskDateWithRetry(editorRoot, pickerRoot, target)) {
    return true;
  }

  const nextMonth = queryFirstVisible(pickerRoot, CALENDAR_NEXT_MONTH_SELECTORS);
  if (nextMonth) {
    nextMonth.click();
    await wait(120);
    if (await pickTaskDateWithRetry(editorRoot, pickerRoot, target)) {
      return true;
    }
  }

  return false;
}

async function shiftTaskDateInputs(editorRoot: HTMLElement): Promise<number> {
  const originalTaskDate = getTaskDisplayedDate(editorRoot) ?? parseFirstDateFromText(editorRoot.innerText);
  if (!originalTaskDate) {
    if (await shiftTaskDateViaDirectInput(editorRoot)) {
      return 1;
    }
    return 0;
  }

  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await shiftTaskDateViaDirectInput(editorRoot)) {
      return 1;
    }

    if (await shiftTaskDateViaPicker(editorRoot, originalTaskDate)) {
      const verifyDeadline = Date.now() + 2200;
      while (Date.now() < verifyDeadline) {
        const currentTaskDate = getTaskDisplayedDate(editorRoot);
        if (currentTaskDate && daysBetween(currentTaskDate, originalTaskDate) === SHIFT_DAYS) {
          return 1;
        }
        await wait(80);
      }
    }

    await wait(180);
  }

  return 0;
}

async function shiftDateInputs(editorRoot: HTMLElement, kind: ItemKind): Promise<number> {
  if (kind === 'task') {
    return shiftTaskDateInputs(editorRoot);
  }

  const deadline = Date.now() + 8000;

  while (Date.now() < deadline) {
    maybeOpenDateControls(editorRoot, kind);

    const candidates = queryAllVisible(editorRoot, DATE_INPUT_SELECTORS)
      .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement)
      .filter((input) => looksLikeDateText(input.value));

    const maxFields = kind === 'event' ? 2 : 1;
    const selected = candidates.slice(0, maxFields);

    let changed = 0;
    for (const input of selected) {
      const beforeParsed = parseDateTime(input.value);
      const shifted = shiftDateInputValue(input.value, SHIFT_DAYS);
      if (!shifted || shifted === input.value) {
        continue;
      }

      setInputValueAndDispatch(input, shifted);
      await wait(50);
      const afterParsed = parseDateTime(input.value);
      if (beforeParsed && afterParsed && daysBetween(afterParsed.date, beforeParsed.date) === SHIFT_DAYS) {
        changed += 1;
      } else if (input.value === shifted) {
        changed += 1;
      }
    }

    if (changed > 0) {
      return changed;
    }

    await wait(180);
  }

  return 0;
}

async function clickSave(editorRoot: HTMLElement): Promise<boolean> {
  const explicitSave = queryFirstVisible(editorRoot, SAVE_BUTTON_SELECTORS) ?? queryFirstVisible(document, SAVE_BUTTON_SELECTORS);
  if (explicitSave) {
    explicitSave.click();
    await wait(250);
    return true;
  }

  const byText = findButtonByText(editorRoot, ['Save']) ?? findButtonByText(document, ['Save']);
  if (!byText) {
    return false;
  }

  byText.click();
  await wait(250);
  return true;
}

async function maybeHandleRecurringPrompt(): Promise<void> {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const choice = findButtonByText(document, RECURRENCE_BUTTON_TEXT);
    if (choice) {
      choice.click();
      return;
    }

    await wait(120);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => bootstrap(), { once: true });
} else {
  bootstrap();
}
