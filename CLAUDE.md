# Notes for Claude sessions

- Owner: Murphy (systems analyst, reads docs/diagrams more than code; writes in Russian — answer in Russian).
  A separate narrative designer writes story/cards; they know Unity and Ink.
- Design doc: Google Doc "Компактный диздок v0.2". Architecture/plan: Claude Doc "Монкибол: архитектура и план прототипа".
- Stack: TypeScript + Vite + Preact, zod + yaml for content, Vitest. Mobile later via Capacitor; mini-games later via PixiJS; Ink via inkjs for multi-step scenes (not yet used).
- Core rule: `src/core` stays pure and deterministic (seeded RNG in state, no DOM/clock). Timers live in the UI and dispatch a normal action with `timedOut: true`.
- Content lives in `content/` (YAML), validated by `src/core/content.ts`. Keep `docs/content-format.md` in sync with schema changes.
- Before pushing: `npm run validate && npm test && npm run build`. Use `npm run bot` to check balance after changing numbers.
- UI text: every string in ru and en (`src/ui/i18n.ts`). Don't assume horse gender in Russian templates.
