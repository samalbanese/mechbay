import Phaser from 'phaser'
import type { AppState } from '../../../shared/types'
import { bus } from '../bus'

const TILE_W = 64
const TILE_H = 32
const GRID_W = 20
const GRID_H = 20
const DROP_RADIUS = 60

function isoToScreen(tile: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (tile.x - tile.y) * (TILE_W / 2),
    y: (tile.x + tile.y) * (TILE_H / 2)
  }
}

/**
 * Phaser scene for the isometric mech bay. Wave 2 uses rectangles as
 * placeholders; Wave 3 replaces them with real sprites. The bay is a
 * 20×20 tile grid rendered in 3/4 iso projection.
 */
export class BayScene extends Phaser.Scene {
  private state: AppState | null = null
  private mechSprites = new Map<string, Phaser.GameObjects.Rectangle>()
  private facilitySprites = new Map<string, Phaser.GameObjects.Rectangle>()

  constructor() {
    super('BayScene')
  }

  setState(state: AppState): void {
    const prev = this.state
    this.state = state
    if (this.scene.isActive()) this.render()
    if (prev) this.reactToDeploymentTransitions(prev, state)
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0805')
    // Center the iso diamond on the canvas — grid origin (0,0) sits at
    // top-center, extends down-right for +x and down-left for +y.
    this.cameras.main.centerOn(0, 240)
    this.drawGrid()
    if (this.state) this.render()
  }

  private drawGrid(): void {
    const g = this.add.graphics()
    g.lineStyle(1, 0xe85f00, 0.12)
    for (let x = 0; x < GRID_W; x++) {
      for (let y = 0; y < GRID_H; y++) {
        const a = isoToScreen({ x, y })
        const b = isoToScreen({ x: x + 1, y })
        const c = isoToScreen({ x: x + 1, y: y + 1 })
        const d = isoToScreen({ x, y: y + 1 })
        g.strokePoints([a, b, c, d, a])
      }
    }
  }

  private render(): void {
    if (!this.state) return

    for (const companion of this.state.companions) {
      if (this.mechSprites.has(companion.id)) continue
      const s = isoToScreen(companion.homeTile)
      const rect = this.add.rectangle(s.x, s.y, 24, 32, 0x00f0ff)
      rect.setStrokeStyle(1, 0xe85f00, 1)
      rect.setInteractive({ draggable: true })
      this.input.setDraggable(rect)

      rect.on('pointerdown', () => {
        bus.emit('companionSelected', { companionId: companion.id })
      })
      rect.on('drag', (_p: Phaser.Input.Pointer, dx: number, dy: number) => {
        rect.x = dx
        rect.y = dy
      })
      rect.on('dragend', () => this.handleDragEnd(companion.id, rect))

      this.mechSprites.set(companion.id, rect)
    }

    for (const facility of this.state.facilities) {
      if (this.facilitySprites.has(facility.id)) continue
      const s = isoToScreen(facility.tile)
      const rect = this.add.rectangle(s.x, s.y, 80, 48, 0x8a5a4a)
      rect.setStrokeStyle(2, 0xe85f00, 1)
      rect.setInteractive()
      rect.on('pointerup', () => bus.emit('facilityClicked', { facilityId: facility.id }))
      this.facilitySprites.set(facility.id, rect)

      // Label
      this.add
        .text(s.x, s.y + 32, facility.name.toUpperCase(), {
          fontSize: '10px',
          color: '#e85f00',
          fontFamily: 'Courier New'
        })
        .setOrigin(0.5)
    }

    // Remove sprites for entities no longer in state (e.g., decommissioned facility)
    for (const [id, rect] of this.mechSprites) {
      if (!this.state.companions.some((c) => c.id === id)) {
        rect.destroy()
        this.mechSprites.delete(id)
      }
    }
    for (const [id, rect] of this.facilitySprites) {
      if (!this.state.facilities.some((f) => f.id === id)) {
        rect.destroy()
        this.facilitySprites.delete(id)
      }
    }
  }

  private handleDragEnd(companionId: string, rect: Phaser.GameObjects.Rectangle): void {
    if (!this.state) return
    const dropped = this.state.facilities.find((f) => {
      const s = isoToScreen(f.tile)
      return Math.hypot(rect.x - s.x, rect.y - s.y) < DROP_RADIUS
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
      targets: rect,
      x: home.x,
      y: home.y,
      duration: 300,
      ease: 'Back.easeOut'
    })
  }

  /**
   * Smoothly move a mech sprite to a target tile. Used for deploy walk
   * animations. Resolves when the tween completes.
   */
  walkTo(companionId: string, targetTile: { x: number; y: number }): Promise<void> {
    const rect = this.mechSprites.get(companionId)
    if (!rect) return Promise.resolve()
    const target = isoToScreen(targetTile)
    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: rect,
        x: target.x,
        y: target.y,
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

      // walking-to: walk the mech to the facility
      if (dep.status === 'walking-to' && prevDep.status !== 'walking-to') {
        const facility = next.facilities.find((f) => f.id === dep.facilityId)
        if (facility) void this.walkTo(dep.companionId, facility.tile)
      }

      // completed/cancelled: walk the mech home (failed stays dead-in-field in Wave 3)
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
