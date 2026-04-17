/**
 * Renderer-internal event bus. Bridges Phaser (game world events) and
 * React (UI reactions). Keeps Phaser scenes decoupled from React state —
 * Phaser emits, React listens, both stay ignorant of each other's internals.
 */

import mitt from 'mitt'

export type BusEvents = {
  /** Mech dropped onto a facility via drag-drop — triggers deploy flow. */
  dropOnFacility: { companionId: string; facilityId: string }
  /** Single-click on a facility (no drag) — opens the file browser. */
  facilityClicked: { facilityId: string }
  /** Mech selected or deselected — drives the companion stats panel. */
  companionSelected: { companionId: string | null }
}

export const bus = mitt<BusEvents>()
