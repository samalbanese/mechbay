import Phaser from 'phaser'
import type { AppState, FacilityType, MechClass } from '../../../shared/types'
import { bus } from '../bus'

import atlasUrl from '../../../../assets/mechs/atlas-poc.png?url'
import marauderUrl from '../../../../assets/mechs/marauder-poc.png?url'
import ravenUrl from '../../../../assets/mechs/raven-poc.png?url'
import catapultUrl from '../../../../assets/mechs/catapult-poc.png?url'
import locustUrl from '../../../../assets/mechs/locust-poc.png?url'

import securityBayUrl from '../../../../assets/facilities/security-bay-poc.png?url'
import researchLabUrl from '../../../../assets/facilities/research-lab-poc.png?url'
import foundryUrl from '../../../../assets/facilities/foundry-poc.png?url'
import commandCenterUrl from '../../../../assets/facilities/command-center-poc.png?url'
import salvageDockUrl from '../../../../assets/facilities/salvage-dock-poc.png?url'
import dataArchiveUrl from '../../../../assets/facilities/data-archive-poc.png?url'

import groundTileUrl from '../../../../assets/ground-tile-poc.png?url'

const TILE_W = 128
const TILE_H = 64
const GRID_W = 16
const GRID_H = 16
const DROP_RADIUS = 100

const MECH_KEY: Record<MechClass, string> = {
  atlas: 'mech-atlas',
  marauder: 'mech-marauder',
  raven: 'mech-raven',
  catapult: 'mech-catapult',
  locust: 'mech-locust'
}

const FACILITY_KEY: Record<FacilityType, string> = {
  'security-bay': 'facility-security-bay',
  'research-lab': 'facility-research-lab',
  foundry: 'facility-foundry',
  'command-center': 'facility-command-center',
  'salvage-dock': 'facility-salvage-dock',
  'data-archive': 'facility-data-archive'
}

// Display height for mech sprites after downscaling from Gemini's ~1024 output.
// Mechs hover at roughly 1 tile × 1.5 tile iso footprint.
const MECH_DISPLAY_SIZE = 96

// Facilities span ~2 tiles wide × ~1.5 tiles tall on the grid.
const FACILITY_DISPLAY_W = 224
const FACILITY_DISPLAY_H = 168

function isoToScreen(tile: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (tile.x - tile.y) * (TILE_W / 2),
    y: (tile.x + tile.y) * (TILE_H / 2)
  }
}

/**
 * Phaser scene for the isometric mech bay. Wave 3 loaded real sprites via
 * Vite `?url` imports; the bay is a 16×16 iso grid rendered in 3/4 projection
 * with 128×64 diamond tiles.
 */
export class BayScene extends Phaser.Scene {
  private state: AppState | null = null
  private mechSprites = new Map<string, Phaser.GameObjects.Image>()
  private facilitySprites = new Map<string, Phaser.GameObjects.Image>()

  constructor() {
    super('BayScene')
  }

  setState(state: AppState): void {
    const prev = this.state
    this.state = state
    if (this.scene.isActive()) this.render()
    if (prev) this.reactToDeploymentTransitions(prev, state)
  }

  preload(): void {
    // Loud asset-load failures — silent fallbacks to Phaser's green __DEFAULT
    // texture tile into a hexagon pattern and are very confusing.
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(`[BayScene] asset failed to load: ${file.key} → ${file.url}`)
    })

    this.load.image('ground', groundTileUrl)

    this.load.image('mech-atlas', atlasUrl)
    this.load.image('mech-marauder', marauderUrl)
    this.load.image('mech-raven', ravenUrl)
    this.load.image('mech-catapult', catapultUrl)
    this.load.image('mech-locust', locustUrl)

    this.load.image('facility-security-bay', securityBayUrl)
    this.load.image('facility-research-lab', researchLabUrl)
    this.load.image('facility-foundry', foundryUrl)
    this.load.image('facility-command-center', commandCenterUrl)
    this.load.image('facility-salvage-dock', salvageDockUrl)
    this.load.image('facility-data-archive', dataArchiveUrl)
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0805')
    // Center camera on the geometric middle of the 16×16 iso diamond.
    // Center tile is (GRID_W/2, GRID_H/2) which iso-maps to (0, GRID_H*TILE_H/2).
    const center = isoToScreen({ x: GRID_W / 2, y: GRID_H / 2 })
    this.cameras.main.centerOn(center.x, center.y)
    // Zoom out enough to show the whole bay in a ~1100×640 viewport.
    this.cameras.main.setZoom(0.65)
    this.drawGround()
    if (this.state) this.render()
  }

  /**
   * Tile the ground diamond across the 16×16 grid. Each tile image sits
   * centered on its iso position; overlap at edges is intentional (the
   * orange grid line reads as a unified floor pattern).
   */
  private drawGround(): void {
    for (let x = 0; x < GRID_W; x++) {
      for (let y = 0; y < GRID_H; y++) {
        const s = isoToScreen({ x, y })
        this.add.image(s.x, s.y, 'ground').setDisplaySize(TILE_W, TILE_H).setDepth(0)
      }
    }
  }

  private render(): void {
    if (!this.state) return

    for (const companion of this.state.companions) {
      if (this.mechSprites.has(companion.id)) continue
      const s = isoToScreen(companion.homeTile)

      const sprite = this.add.image(s.x, s.y - MECH_DISPLAY_SIZE * 0.35, MECH_KEY[companion.mechClass])
      sprite.setDisplaySize(MECH_DISPLAY_SIZE, MECH_DISPLAY_SIZE)
      // Depth by y so mechs further south render on top of mechs further north.
      sprite.setDepth(100 + s.y)
      sprite.setInteractive({ draggable: true, pixelPerfect: false })
      this.input.setDraggable(sprite)

      sprite.on('pointerdown', () => {
        bus.emit('companionSelected', { companionId: companion.id })
        sprite.setTint(0xffcc33)
        this.time.delayedCall(120, () => sprite.clearTint())
      })
      sprite.on('drag', (_p: Phaser.Input.Pointer, dx: number, dy: number) => {
        sprite.x = dx
        sprite.y = dy
      })
      sprite.on('dragend', () => this.handleDragEnd(companion.id, sprite))

      this.mechSprites.set(companion.id, sprite)
    }

    for (const facility of this.state.facilities) {
      if (this.facilitySprites.has(facility.id)) continue
      const s = isoToScreen(facility.tile)

      const sprite = this.add.image(s.x, s.y - FACILITY_DISPLAY_H * 0.3, FACILITY_KEY[facility.facilityType])
      sprite.setDisplaySize(FACILITY_DISPLAY_W, FACILITY_DISPLAY_H)
      sprite.setDepth(50 + s.y)
      sprite.setInteractive()
      sprite.on('pointerup', () => bus.emit('facilityClicked', { facilityId: facility.id }))
      this.facilitySprites.set(facility.id, sprite)

      // Facility label below the sprite
      this.add
        .text(s.x, s.y + FACILITY_DISPLAY_H * 0.3, facility.name.toUpperCase(), {
          fontSize: '12px',
          color: '#e85f00',
          fontFamily: 'Courier New',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 3
        })
        .setOrigin(0.5)
        .setDepth(500)
    }

    // Remove sprites for entities no longer in state (e.g., decommissioned facility)
    for (const [id, sprite] of this.mechSprites) {
      if (!this.state.companions.some((c) => c.id === id)) {
        sprite.destroy()
        this.mechSprites.delete(id)
      }
    }
    for (const [id, sprite] of this.facilitySprites) {
      if (!this.state.facilities.some((f) => f.id === id)) {
        sprite.destroy()
        this.facilitySprites.delete(id)
      }
    }
  }

  private handleDragEnd(companionId: string, sprite: Phaser.GameObjects.Image): void {
    if (!this.state) return
    const dropped = this.state.facilities.find((f) => {
      const s = isoToScreen(f.tile)
      return Math.hypot(sprite.x - s.x, sprite.y - s.y) < DROP_RADIUS
    })

    if (dropped) {
      bus.emit('dropOnFacility', { companionId, facilityId: dropped.id })
    }

    // Always snap mech back to home — the deploy flow will walk it to the
    // facility via walkTo() once the deployment transitions to walking-to.
    const companion = this.state.companions.find((c) => c.id === companionId)
    if (!companion) return
    const home = isoToScreen(companion.homeTile)
    this.tweens.add({
      targets: sprite,
      x: home.x,
      y: home.y - MECH_DISPLAY_SIZE * 0.35,
      duration: 300,
      ease: 'Back.easeOut'
    })
  }

  /**
   * Smoothly move a mech sprite to a target tile. Used for deploy walk
   * animations. Resolves when the tween completes.
   */
  walkTo(companionId: string, targetTile: { x: number; y: number }): Promise<void> {
    const sprite = this.mechSprites.get(companionId)
    if (!sprite) return Promise.resolve()
    const target = isoToScreen(targetTile)
    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: sprite,
        x: target.x,
        y: target.y - MECH_DISPLAY_SIZE * 0.35,
        duration: 1500,
        ease: 'Sine.easeInOut',
        onComplete: () => resolve()
      })
    })
  }

  /**
   * Diff two state snapshots and trigger animations for deployment
   * status transitions (idle → walking-to, completed/cancelled → returning).
   */
  private reactToDeploymentTransitions(prev: AppState, next: AppState): void {
    for (const dep of next.deployments) {
      const prevDep = prev.deployments.find((d) => d.id === dep.id)
      if (!prevDep) continue

      if (dep.status === 'walking-to' && prevDep.status !== 'walking-to') {
        const facility = next.facilities.find((f) => f.id === dep.facilityId)
        if (facility) void this.walkTo(dep.companionId, facility.tile)
      }

      if (
        (dep.status === 'completed' || dep.status === 'cancelled') &&
        prevDep.status !== 'completed' &&
        prevDep.status !== 'cancelled'
      ) {
        const companion = next.companions.find((c) => c.id === dep.companionId)
        if (companion) void this.walkTo(dep.companionId, companion.homeTile)
      }
    }
  }
}
