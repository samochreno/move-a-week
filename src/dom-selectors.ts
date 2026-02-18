export const ITEM_ROOT_SELECTORS = ['[role="dialog"]', '.VfPpkd-StrnGf-rymPhb', 'div[aria-modal="true"]'];

export const EVENT_EDIT_BUTTON_SELECTORS = [
  'button[aria-label="Edit event"]',
  '[role="button"][aria-label="Edit event"]',
  'button[aria-label="Upraviť udalosť"]',
  '[role="button"][aria-label="Upraviť udalosť"]',
  'button[aria-label="Edit"]',
  '[role="button"][aria-label="Edit"]',
  'button[aria-label="Upraviť"]',
  '[role="button"][aria-label="Upraviť"]',
  'button[data-tooltip*="Edit"]',
  '[role="button"][data-tooltip*="Edit"]',
  'button[data-tooltip*="Upraviť"]',
  '[role="button"][data-tooltip*="Upraviť"]'
];

export const TASK_EDIT_BUTTON_SELECTORS = [
  'button[aria-label="Edit task"]',
  '[role="button"][aria-label="Edit task"]',
  'button[aria-label="Upraviť úlohu"]',
  '[role="button"][aria-label="Upraviť úlohu"]',
  'button[aria-label="Edit"]',
  '[role="button"][aria-label="Edit"]',
  'button[aria-label="Upraviť"]',
  '[role="button"][aria-label="Upraviť"]',
  'button[data-tooltip*="Edit"]',
  '[role="button"][data-tooltip*="Edit"]',
  'button[data-tooltip*="Upraviť"]',
  '[role="button"][data-tooltip*="Upraviť"]'
];

export const DATE_INPUT_SELECTORS = [
  'input[aria-label*="date" i]',
  'input[aria-label*="dátum" i]',
  'input[aria-label*="datum" i]',
  'input[placeholder*="date" i]',
  'input[placeholder*="dátum" i]',
  'input[placeholder*="datum" i]',
  'input[name*="date" i]',
  'input[name*="datum" i]',
  'input[type="text"]'
];

export const TASK_DATE_TRIGGER_SELECTORS = [
  '[role="button"][aria-label*="date" i]',
  '[role="button"][aria-label*="due" i]',
  'button[aria-label*="date" i]',
  'button[aria-label*="due" i]'
];

export const CALENDAR_NEXT_MONTH_SELECTORS = [
  'button[aria-label*="Next month" i]',
  '[role="button"][aria-label*="Next month" i]',
  'button[aria-label*="month" i][aria-label*="next" i]',
  '[role="button"][aria-label*="month" i][aria-label*="next" i]'
];

export const CALENDAR_PREVIOUS_WEEK_SELECTORS = [
  'button[aria-label*="Previous week" i]',
  '[role="button"][aria-label*="Previous week" i]'
];

export const SAVE_BUTTON_SELECTORS = [
  'button[aria-label="Save"]',
  '[role="button"][aria-label="Save"]',
  'button[aria-label="Uložiť"]',
  '[role="button"][aria-label="Uložiť"]',
  'button[jsname][data-mdc-dialog-action="save"]',
  '[role="button"][data-mdc-dialog-action="save"]'
];

export const RECURRENCE_BUTTON_TEXT = [
  'This event',
  'Only this event',
  'Táto udalosť',
  'Iba táto udalosť',
  'Len táto udalosť'
];

export function isElementVisible(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
}

export function queryFirstVisible(root: ParentNode, selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const candidate = root.querySelector(selector);
    if (candidate && isElementVisible(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function queryAllVisible(root: ParentNode, selectors: string[]): HTMLElement[] {
  const output: HTMLElement[] = [];

  for (const selector of selectors) {
    const matches = root.querySelectorAll(selector);
    matches.forEach((match) => {
      if (isElementVisible(match) && !output.includes(match as HTMLElement)) {
        output.push(match as HTMLElement);
      }
    });
  }

  return output;
}

export function findButtonByText(root: ParentNode, options: string[]): HTMLElement | null {
  const buttons = root.querySelectorAll<HTMLElement>('button, [role="button"]');
  for (const button of buttons) {
    if (!isElementVisible(button)) {
      continue;
    }

    const text = button.textContent?.trim().toLowerCase();
    if (!text) {
      continue;
    }

    if (options.some((option) => option.toLowerCase() === text)) {
      return button;
    }
  }

  return null;
}
