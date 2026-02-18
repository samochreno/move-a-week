# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains extension source code: `content.ts` (injected behavior), `dom-selectors.ts` (UI selectors/helpers), `date-utils.ts` (date parsing/shift logic), and `styles.css`.
- `tests/` contains Playwright specs and shared helpers in `tests/fixtures.ts`.
- `manifest.json` defines the Chrome MV3 extension; `dist/content.js` is the generated bundle.
- `test-results/` and `dist/` are generated outputs. Do not hand-edit generated files.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies.
- `pnpm run build:ext`: bundle `src/content.ts` to `dist/content.js` with esbuild.
- `pnpm run typecheck`: run TypeScript checks without emitting files.
- `pnpm run test:auth`: one-time Google Calendar auth bootstrap (headed browser).
- `pnpm test`: build extension and run main calendar shift regression suite.
- `pnpm run test:smoke`: quick sanity check for +7 day shift behavior.
- `pnpm run test:headed`: run the main suite in headed mode for debugging.

## Coding Style & Naming Conventions

- Language: TypeScript (ES modules), 2-space indentation, semicolons, single quotes.
- Naming: `camelCase` for functions/variables, `PascalCase` for types/interfaces, `UPPER_SNAKE_CASE` for constants.
- Keep selector logic centralized in `dom-selectors.ts`; keep date/time transformations in `date-utils.ts`.
- Prefer small, composable functions and explicit return types for exported APIs.

## Testing Guidelines

- Framework: `@playwright/test` with specs under `tests/*.spec.ts`.
- Existing scenarios rely on fixture env vars such as `MAW_TIMED_EVENT_TITLE` and `MAW_TASK_NO_TIME_TITLE`.
- Keep new tests scenario-driven and name files as `<feature>.spec.ts`.
- Before opening a PR, run at least `pnpm run typecheck` and `pnpm run test:smoke`; run `pnpm test` for behavior changes.

## Security & Configuration Tips

- Auth state is stored in `tests/.auth/` and is ignored by git; never commit credentials or session artifacts.
- Rebuild (`pnpm run build:ext`) before loading unpacked extension in Chrome.
