# MechBay

*Battletech for AI coding agents.*

An Electron desktop app where you deploy real AI coding agents — Claude,
Codex, Kimi, Gemini, Hermes — as distinct mech classes onto
industrial-facility project-buildings in an isometric MechWarrior-styled
command bay. Each mech has a soul and a memory.

![MechBay preview](docs/preview.gif)

*30-second demo: drag a mech onto a facility, watch the live log, see the completion.*

## What it does

- **5 mech classes** map 1:1 to AI families:
  - Atlas → Claude
  - Marauder → Codex
  - Raven → Kimi
  - Catapult → Gemini
  - Locust → Hermes
- **6 industrial facilities** on a 16×16 isometric grid: Security Bay,
  Research Lab, Foundry, Command Center, Salvage Dock, Data Archive.
- **Drag a mech onto a facility** to deploy. A modal collects a task
  prompt (with 4 quick-prompt chips for common asks), the mech walks to
  the facility, and the CLI process streams live into a log panel.
- **Up to 3 concurrent deployments.** Additional drops queue
  automatically; the HUD shows `ACTIVE: n/3 · QUEUE: m`.
- **Dead-in-field shader** on failure — mech slumps gray with smoke,
  click to recover and walk home.
- **Crash recovery** — if you force-quit mid-deploy, the next boot
  detects zombies and surfaces them in a red recovery modal.
- **NOT DEPLOYABLE overlay** for mechs whose CLI isn't on your PATH,
  probed automatically at boot.
- **Souls + memory** — each mech has a `soul.md` (persona, speaking
  style) and a `memory.md` (history of past deployments). Both get
  read into the system prompt on every deploy, so mechs evolve as you
  edit their souls and accumulate history through use.
- **Inline File Browser** — click any facility to browse its project
  directory in the sidebar. Files are read through a whitelist-guarded
  FsReader; `..` traversal and symlink escapes both fail closed.

## Stack

Electron 39 · React 19 · TypeScript 5 · electron-vite 5 · Phaser 3.88 · Vitest 2

## Installation

Currently source-only — installer config is landed but builds aren't
signed yet, so it's all `npm run dev` for now.

```bash
git clone <repo>
cd mechbay
npm install
npm run dev
```

For deploys to actually execute you also need at least one of these
CLIs on your PATH:

- **Claude Code** (`claude`) — Anthropic's coding agent CLI
- **Codex** (`codex`) — OpenAI GPT-5.4-Codex via `codex exec`
- **Kimi** (`kimi`) — Moonshot Kimi via the native CLI's `--print -p <prompt>`
- **Gemini** (`gemini`) — Google Gemini with `-p <prompt> -o text -y`
- Hermes is wired as a stub — integration deferred

Any CLI not on PATH just renders its mech as NOT DEPLOYABLE; other
mechs still work.

## Project structure

```
src/
  main/          Electron main process (Node.js)
    runners/     One module per agent family + shared CliRunner base
    ipc.ts       IPC handlers: DEPLOY_START, STATE_GET, SCAN_PROJECTS, etc.
    state-manager.ts  Persistence, seed data, schema migration, zombie sweep
    cli-check.ts Boot-time CLI availability probe
    project-scanner.ts  Directory walk for ~/Projects project markers
  preload/       contextBridge surface (window.mechbay.*)
  renderer/
    src/
      App.tsx          React shell with HUD + sidebar + modals
      game/BayScene.ts Phaser isometric scene
      components/      DeployModal, CrashRecoveryModal, Versions
      bus.ts           mitt event bus between Phaser and React
  shared/        Types + IPC channel constants used by main AND renderer
test/
  unit/          Vitest unit tests (runners, state-manager, cli-check, scanner)
  integration/   End-to-end deploy lifecycle against a fixture runner
assets/          Mech/facility sprites (Gemini-generated, 1024×1024 PNGs)
docs/
  DECISIONS.md          Architecture + locked design decisions
  manual-smoke-tests.md Ten manual scenarios for release-gating
  superpowers/plans/    The original implementation plan
  overnight-prep/       Decision docs for deferred design questions
```

## Development

```bash
npm run dev          # electron-vite dev + hot reload
npm run typecheck    # tsc --noEmit on node + web configs
npm test             # vitest run (all suites)
npm run test:watch   # vitest watch mode
npm run build        # typecheck + electron-vite build → out/
npm run build:win    # → electron-builder Windows NSIS installer (dist/)
npm run chromakey    # process mech/facility sprites (jimp-based)
```

## Status

**MVP-complete.** Waves 1-6 shipped:

- ✅ Wave 1 — Plumbing (Electron scaffold, runner interface,
  ClaudeRunner, StateManager, IPC, bare UI, integration test)
- ✅ Wave 2 — Game layer (Phaser iso grid, drag-drop, walk tween,
  MW HUD bezels)
- ✅ Wave 3 — Assets + dead-in-field shader (all 12 sprites via
  Gemini 3 Pro, click-to-recover)
- ✅ Wave 4 — Full cast (4 more runners, CLI probe, queue,
  Deploy Modal)
- ✅ Wave 5 — Souls + File Browser (soul.md / memory.md scaffolding,
  system prompt assembly, whitelist-guarded FsReader, tabbed
  sidebar File Browser)
- ✅ Wave 6 — Polish (project scanner, crash recovery modal, smoke
  tests doc, this README, installer config)

See `docs/DECISIONS.md` for the design-decision log and
`docs/superpowers/plans/2026-04-17-mechbay-implementation.md` for the
original 6-wave plan.

## Why

I wanted my AI agents to feel like companions, not buttons.
