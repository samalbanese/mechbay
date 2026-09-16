# MechBay: Command Edition

The original intent is a companion-oriented command bay for real local coding agents. The September 2026 interface makes the deployment loop legible without replacing the original isometric world, persistent personalities, or runner architecture.

## Visual direction

Aerospace instruments meet an industrial strategy-game command deck. Use olive-black panels, warm amber actions, subdued green status, condensed display typography, and the original mech/facility art. Avoid neon rainbow treatments, floating generic dashboard cards, invented telemetry, or decorative progress percentages.

- Background: #111610. Panel: #191f17. Raised control: #20271c.
- Border: #33392f. Primary text: #ecece2. Secondary: #a5ac9e.
- Primary action: #efc36d. Ready: #b2ce8c. Recon accent: #91c7bc.
- Barlow Condensed 500/600/700 for display; Barlow 400/500/600 for reading; IBM Plex Mono 400/500 for instrumentation. Fonts ship locally with the app.
- Square panels and controls. Borders carry structure; glow is reserved for field activity.

## Layout and behavior

The command header is followed by an asymmetric field/control split. Keep the crew roster visible below the field. Operations is the default view, with a mission brief, recent sorties, and linked-project controls. Selecting a crew member updates both the dispatch form and the field selection. Personality and runtime editing live in Journal.

Provide a button/select route for every essential canvas action. Deployment opens a task dialog; submitting starts the existing real IPC deployment flow. Preserve the prompt and expose errors if starting fails. Successful deployment switches to the live log. Completed reports can be reopened from the sortie board.

Counts come from persisted state. A queued mech is assigned but does not consume an active slot. A completed report freezes its duration. Simulation must stay clearly labeled. Diffs reflect the working tree, may include existing changes, and exclude untracked/binary line totals.

## Motion and resizing

Use a subtle status pulse, short panel reveal, and restrained portrait hover movement alongside the existing Phaser animation. Honor reduced motion for HTML and the app's motion setting for the bay. Scale the canvas against both the actual parent's width and height after layout changes; assert that it fits during capture. Below 900px, stack the command views. Narrow screens use a scrollable crew roster.

## Portfolio evidence

Capture the running Electron build in a separate temporary profile with simulation enabled. Never use the user's active bay for automated captures. Keep actual file-change evidence, use no credentials, and do not label recorded output as a live feed. Export three full-size screenshots, a poster, and a 24-second accelerated recording. See `portfolio-refresh.md`.
