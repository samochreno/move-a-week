export interface ParsedDateTime {
  date: Date;
  hasTime: boolean;
  isAllDay: boolean;
}

const MONTH_NAME_RE = /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)/i;
const NUMERIC_DATE_RE = /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/;
const TIME_RE = /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i;

interface DateTemplate {
  includesWeekday: boolean;
  includesYear: boolean;
  monthStyle: 'short' | 'long';
}

function stripBulletSuffix(value: string): string {
  return value.split('·')[0].trim();
}

function stripWeekdayPrefix(value: string): string {
  if (/^[A-Za-z]+,\s+/.test(value) && MONTH_NAME_RE.test(value)) {
    return value.replace(/^[A-Za-z]+,\s+/, '');
  }
  return value;
}

function inferTemplate(value: string): DateTemplate {
  const includesWeekday = /^[A-Za-z]+,\s+/.test(value) && MONTH_NAME_RE.test(value);
  const includesYear = /\b\d{4}\b/.test(value);
  const monthMatch = value.match(MONTH_NAME_RE);
  const monthStyle: 'short' | 'long' = monthMatch && monthMatch[0].length <= 3 ? 'short' : 'long';

  return {
    includesWeekday,
    includesYear,
    monthStyle
  };
}

function parseDateCandidate(rawValue: string): Date | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  let candidate = stripBulletSuffix(trimmed);
  let parsed = new Date(candidate);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  candidate = stripWeekdayPrefix(candidate);
  parsed = new Date(candidate);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  if (!/\b\d{4}\b/.test(candidate)) {
    const currentYear = new Date().getFullYear();
    parsed = new Date(`${candidate}, ${currentYear}`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

export function looksLikeDateText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (TIME_RE.test(trimmed) && !MONTH_NAME_RE.test(trimmed) && !NUMERIC_DATE_RE.test(trimmed)) {
    return false;
  }

  if (!MONTH_NAME_RE.test(trimmed) && !NUMERIC_DATE_RE.test(trimmed)) {
    return false;
  }

  return parseDateCandidate(trimmed) !== null;
}

export function parseDateTime(value: string): ParsedDateTime | null {
  if (!looksLikeDateText(value)) {
    return null;
  }

  const parsed = parseDateCandidate(value);
  if (!parsed) {
    return null;
  }

  const hasTime = TIME_RE.test(value);
  return {
    date: parsed,
    hasTime,
    isAllDay: !hasTime
  };
}

export function addDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function formatDateFromTemplate(date: Date, template: DateTemplate): string {
  const formatOptions: Intl.DateTimeFormatOptions = {
    month: template.monthStyle,
    day: 'numeric'
  };

  if (template.includesYear) {
    formatOptions.year = 'numeric';
  }

  if (template.includesWeekday) {
    formatOptions.weekday = 'long';
  }

  return new Intl.DateTimeFormat('en-US', formatOptions).format(date);
}

export function shiftDateInputValue(value: string, days: number): string | null {
  if (!looksLikeDateText(value)) {
    return null;
  }

  const parsed = parseDateCandidate(value);
  if (!parsed) {
    return null;
  }

  const template = inferTemplate(value);
  const shifted = addDays(parsed, days);
  return formatDateFromTemplate(shifted, template);
}

export function daysBetween(left: Date, right: Date): number {
  const leftDate = new Date(left.getFullYear(), left.getMonth(), left.getDate());
  const rightDate = new Date(right.getFullYear(), right.getMonth(), right.getDate());
  const millis = leftDate.getTime() - rightDate.getTime();
  return Math.round(millis / 86400000);
}

export function extractTimesFromText(value: string): string[] {
  return Array.from(value.matchAll(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/gi)).map((match) =>
    match[0].replace(/\s+/g, '').toLowerCase()
  );
}

export function extractDatesFromText(value: string): Date[] {
  const matches = Array.from(
    value.matchAll(
      /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2}(?:,\s*\d{4})?/gi
    )
  );

  const parsed = matches
    .map((match) => parseDateCandidate(match[0]))
    .filter((date): date is Date => date !== null);

  return parsed;
}
