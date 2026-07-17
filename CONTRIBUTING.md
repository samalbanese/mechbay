# Contributing to MechBay

Thanks for helping build MechBay. Keep changes focused, explain the player-facing result, and open a pull request with the checks below complete.

## Development setup

```bash
git clone https://github.com/samalbanese/mechbay.git
cd mechbay
npm install
npm run dev
```

Use Node.js 20+ and keep git on `PATH`; Mission Debrief uses it to capture facility diffs.

## Before every pull request

Run all three gates:

```bash
npm run typecheck
npm test
npm run build
```

## Code conventions

- Use Conventional Commit-style subjects: `feat:`, `fix:`, `chore:`, or `docs:`.
- For main-process modules, write the focused unit test first, see it fail, implement the module, then wire its IPC surface.
- React renderer source lives in `src/renderer/src/`; the outer `src/renderer/` directory only holds renderer entry files.
- Define and import IPC channels only through `src/shared/ipc-channels.ts`. Do not hand-type channel strings elsewhere.

## Scope and safety

Keep the main process, preload bridge, shared types, and renderer changes aligned. If a UI change needs a new IPC call, add its channel to the shared registry and keep values serializable across the Electron boundary.
