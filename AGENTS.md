# Move-A-Week Agent Rules

## Scope

- This repo is a Chrome MV3 extension for `calendar.google.com`.
- Primary runtime files:
  - `src/content.ts` for injected behavior.
  - `src/dom-selectors.ts` for selector strategy.
  - `src/date-utils.ts` for parsing/shift logic.
  - `src/styles.css` for injected UI.
- Test files live in `tests/`. Generated artifacts are `dist/` and `test-results/` (do not hand-edit).

## Non-Negotiable Workflow (Every Change)

After any code change (extension or tests), run:

1. `pnpm run build:ext`
2. `pnpm run test:smoke`

Do not treat a change as done unless both pass, or you explicitly report why they could not run.

## Playwright Policy

- Use Playwright in headless mode by default.
- Use Chrome channel (`channel: 'chrome'`) for authenticated Calendar runs.
- `pnpm run test:auth` is the only flow that may intentionally open headed for one-time login handoff.
- Prefer deterministic tests that create their own fixtures over manual fixture setup.

## Commands

- `pnpm install` - install dependencies.
- `pnpm run build:ext` - bundle `src/content.ts` to `dist/content.js`.
- `pnpm run typecheck` - TypeScript type checks.
- `pnpm run test:smoke` - deterministic task+event +1 week smoke suite.
- `pnpm test` - broader regression suite.
- `pnpm run test:auth` - one-time auth bootstrap.

## Coding Conventions

- TypeScript, 2-space indentation, semicolons, single quotes.
- `camelCase` for values/functions, `PascalCase` for types, `UPPER_SNAKE_CASE` for constants.
- Keep selectors in `src/dom-selectors.ts`.
- Keep date math/parsing in `src/date-utils.ts`.
- Keep `src/content.ts` focused on flow orchestration and DOM actions.

## Security

- Never commit auth/session data from `tests/.auth/`.
- Never commit secrets.
