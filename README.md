# Move A Week

Chrome MV3 extension that injects a `+1 week` button into Google Calendar event/task popups and shifts the focused item by 7 days while keeping time values unchanged.

## Setup

```bash
pnpm install
pnpm run build:ext
```

## One-time Auth Bootstrap

```bash
pnpm run test:auth
```

This launches headed Chromium. Sign in to Google Calendar, then return to terminal and press Enter. Auth state is saved to `tests/.auth/google-calendar.json`.

## Run Authenticated Tests

Set fixture titles (existing items in your calendar):

```bash
export MAW_TIMED_EVENT_TITLE="Timed fixture"
export MAW_ALL_DAY_EVENT_TITLE="All day fixture"
export MAW_RECURRING_EVENT_TITLE="Recurring fixture"
export MAW_TASK_WITH_TIME_TITLE="Task with time fixture"
export MAW_TASK_NO_TIME_TITLE="Task no time fixture"
```

Run tests:

```bash
pnpm test
```

Recommended smoke run after each extension change:

```bash
pnpm run test:smoke
```

This creates a fresh timed task and timed event, clicks `+1 week`, and verifies a `+7` day shift in headless Chrome.

Optional headed run:

```bash
pnpm run test:headed
```

## Load Extension Manually

1. Build with `pnpm run build:ext`.
2. Open `chrome://extensions`.
3. Enable Developer Mode.
4. Click `Load unpacked` and select this folder (`/Users/samochreno/repos/move-a-week`).
