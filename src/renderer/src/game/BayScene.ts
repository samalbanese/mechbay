import Phaser from 'phaser'
import type { AppState, Deployment, FacilityType, MechClass } from '../../../shared/types'
import { bus } from '../bus'
import { colors, type } from '../theme'
import { computeFacingFlipX, computeWalkBob, computeWalkFrame } from './bay-animation'
import { computeDeploymentActions } from './deployment-transitions'

import atlasUrl from '../../../../assets/mechs/atlas-poc.png?url'
import marauderUrl from '../../../../assets/mechs/marauder-poc.png?url'
import ravenUrl from '../../../../assets/mechs/raven-poc.png?url'
import catapultUrl from '../../../../assets/mechs/catapult-poc.png?url'
import locustUrl from '../../../../assets/mechs/locust-poc.png?url'

import atlasWalkUrl from '../../../../assets/mechs/walk/atlas-walk.png?url'
import marauderWalkUrl from '../../../../assets/mechs/walk/marauder-walk.png?url'
import ravenWalkUrl from '../../../../assets/mechs/walk/raven-walk.png?url'
import catapultWalkUrl from '../../../../assets/mechs/walk/catapult-walk.png?url'
import locustWalkUrl from '../../../../assets/mechs/walk/locust-walk.png?url'

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

const MECH_WALK_KEY: Record<MechClass, string> = {
  atlas: 'mech-atlas-walk',
  marauder: 'mech-marauder-walk',
  raven: 'mech-raven-walk',
  catapult: 'mech-catapult-walk',
  locust: 'mech-locust-walk'
}

const MECH_WALK_URL: Record<MechClass, string> = {
  atlas: atlasWalkUrl,
  marauder: marauderWalkUrl,
  raven: ravenWalkUrl,
  catapult: catapultWalkUrl,
  locust: locustWalkUrl
}

/** Cell size of the generated walk sheets (4 frames packed horizontally). */
const WALK_SHEET_FRAME = 256

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

function screenToIso(world: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round(world.x / TILE_W + world.y / TILE_H),
    y: Math.round(world.y / TILE_H - world.x / TILE_W)
  }
}

/** Distance (px) a pointer must move between down + up to count as a drag. */
const CLICK_DRAG_THRESHOLD = 8

/**
 * Phaser scene for the isometric mech bay. Wave 3 loaded real sprites via
 * Vite `?url` imports; the bay is a 16×16 iso grid rendered in 3/4 projection
 * with 128×64 diamond tiles.
 */
export class BayScene extends Phaser.Scene {
  private state: AppState | null = null
  private mechSprites = new Map<string, Phaser.GameObjects.Image>()
  private facilitySprites = new Map<string, Phaser.GameObjects.Image>()
  private smokeEmitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>()
  private unavailableLabels = new Map<string, Phaser.GameObjects.Text>()
  private completionBubbles = new Set<Phaser.GameObjects.Container>()

  // --- Animation-pass state (Wave 7). Every Map/ref here is torn down in
  // shutdown() AND in render()'s entity-removal sweep, mirroring the
  // cleanup pattern already used for smokeEmitters/unavailableLabels above.
  private reducedMotion = false
  private selectedCompanionId: string | null = null
  private selectionRing: Phaser.GameObjects.Graphics | null = null
  private selectionRingTween: Phaser.Tweens.Tween | null = null
  private idleBreathTweens = new Map<string, Phaser.Tweens.Tween>()
  private workingSwayTweens = new Map<string, Phaser.Tweens.Tween>()
  private footDustEmitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>()
  private workLights = new Map<string, Phaser.GameObjects.Image>()
  private workLightTweens = new Map<string, Phaser.Tweens.Tween>()
  private facilityBeacons = new Map<string, Phaser.GameObjects.Image>()
  private facilityBeaconTweens = new Map<string, Phaser.Tweens.Tween>()
  private activeWalks = new Map<
    string,
    {
      tween: Phaser.Tweens.Tween
      promise: Promise<void>
      resolve: () => void
      cancelled: boolean
    }
  >()

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

    for (const mechClass of Object.keys(MECH_WALK_KEY) as MechClass[]) {
      this.load.spritesheet(MECH_WALK_KEY[mechClass], MECH_WALK_URL[mechClass], {
        frameWidth: WALK_SHEET_FRAME,
        frameHeight: WALK_SHEET_FRAME
      })
    }

    this.load.image('facility-security-bay', securityBayUrl)
    this.load.image('facility-research-lab', researchLabUrl)
    this.load.image('facility-foundry', foundryUrl)
    this.load.image('facility-command-center', commandCenterUrl)
    this.load.image('facility-salvage-dock', salvageDockUrl)
    this.load.image('facility-data-archive', dataArchiveUrl)
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this)
    // Checked once at scene creation, not live — a mid-session OS setting
    // change would need a scene restart to take effect, which is fine here.
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.cameras.main.setBackgroundColor('#0a0805')
    // Center camera on the geometric middle of the 16×16 iso diamond.
    // Center tile is (GRID_W/2, GRID_H/2) which iso-maps to (0, GRID_H*TILE_H/2).
    const center = isoToScreen({ x: GRID_W / 2, y: GRID_H / 2 })
    this.cameras.main.centerOn(center.x, center.y)
    // Zoom out enough to show the whole bay in a ~1100×640 viewport.
    this.cameras.main.setZoom(0.65)
    this.generateSmokeTexture()
    this.drawGround()
    if (this.state) this.render()

    // Scene-level pointerup fires for every release, including those
    // landing on interactive sprites (mechs / facilities). We only want
    // the empty-tile handler when: (a) no interactive object was under
    // the pointer, and (b) the pointer barely moved (so drags don't
    // masquerade as clicks on release).
    this.input.on(
      'pointerup',
      (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
        if (currentlyOver.length > 0) return
        const dragDist = Math.hypot(pointer.upX - pointer.downX, pointer.upY - pointer.downY)
        if (dragDist > CLICK_DRAG_THRESHOLD) return

        const tile = screenToIso({ x: pointer.worldX, y: pointer.worldY })
        if (tile.x < 0 || tile.x >= GRID_W || tile.y < 0 || tile.y >= GRID_H) return

        // Guard: don't fire on tiles already occupied by a facility —
        // those are selected via their sprite's own pointerup handler,
        // not via empty-tile click.
        if (this.state?.facilities.some((f) => f.tile.x === tile.x && f.tile.y === tile.y)) {
          return
        }

        bus.emit('emptyTileClicked', { tile })
      }
    )
  }

  /**
   * Per-frame hook (Phaser calls this automatically every tick). The only
   * thing that needs continuous per-frame tracking is the selection ring
   * following its mech around while it walks — everything else here is
   * driven by tweens/timers instead of update().
   */
  update(): void {
    if (!this.selectedCompanionId || !this.selectionRing) return
    const sprite = this.mechSprites.get(this.selectedCompanionId)
    if (!sprite) return
    this.selectionRing.setPosition(sprite.x, sprite.y + MECH_DISPLAY_SIZE * 0.42)
  }

  /**
   * Build a soft gray blob texture at runtime (rather than shipping a PNG)
   * — used as the particle for dead-in-field smoke. Radial gradient, white
   * core fading to transparent, recolored on emit via particleConfig.tint.
   */
  private generateSmokeTexture(): void {
    if (this.textures.exists('smoke')) return
    const size = 32
    const g = this.add.graphics({ x: 0, y: 0 })
    for (let r = size / 2; r > 0; r--) {
      const alpha = (r / (size / 2)) * 0.15
      g.fillStyle(0xffffff, alpha)
      g.fillCircle(size / 2, size / 2, r)
    }
    g.generateTexture('smoke', size, size)
    g.destroy()
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

      const sprite = this.add.image(
        s.x,
        s.y - MECH_DISPLAY_SIZE * 0.35,
        MECH_KEY[companion.mechClass]
      )
      sprite.setDisplaySize(MECH_DISPLAY_SIZE, MECH_DISPLAY_SIZE)
      // setDisplaySize leaves the sprite at a fractional scale (96px /
      // texture size). Every scale animation below must stay RELATIVE to
      // this base — tweening toward absolute 1.0 would stretch the mech
      // back to full texture height.
      sprite.setData('baseScaleY', sprite.scaleY)
      sprite.setData('mechClass', companion.mechClass)
      // Depth by y so mechs further south render on top of mechs further north.
      sprite.setDepth(100 + s.y)
      sprite.setInteractive({ draggable: true, pixelPerfect: false })
      this.input.setDraggable(sprite)

      // Track drag start position to distinguish click from drag
      let dragStartX = 0
      let dragStartY = 0
      let isDragging = false

      sprite.on('dragstart', (_p: Phaser.Input.Pointer) => {
        dragStartX = sprite.x
        dragStartY = sprite.y
        isDragging = false
      })

      sprite.on('drag', (_p: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        sprite.x = dragX
        sprite.y = dragY
        // Mark as dragging if moved more than threshold
        if (Math.hypot(dragX - dragStartX, dragY - dragStartY) > CLICK_DRAG_THRESHOLD) {
          isDragging = true
        }
      })

      sprite.on('dragend', () => {
        this.handleDragEnd(companion.id, sprite)
        isDragging = false
      })

      // Use pointerup to detect clicks (not pointerdown to avoid drag conflict)
      sprite.on('pointerup', () => {
        // Only emit companionSelected if we didn't drag significantly
        if (!isDragging) {
          bus.emit('companionSelected', { companionId: companion.id })
          this.setSelectedCompanion(companion.id)
          sprite.setTint(0xffcc33)
          this.time.delayedCall(120, () => sprite.clearTint())
        }
      })

      this.mechSprites.set(companion.id, sprite)
      this.startIdleBreath(companion.id)
    }

    // Sync NOT DEPLOYABLE overlay with current cliAvailable flag. This
    // re-runs on every setState so the boot CLI check (which updates
    // state async) can flip a mech from unavailable → available without
    // a full scene reload.
    for (const companion of this.state.companions) {
      const sprite = this.mechSprites.get(companion.id)
      if (!sprite) continue
      const hasLabel = this.unavailableLabels.has(companion.id)

      if (!companion.cliAvailable && !hasLabel) {
        sprite.setAlpha(0.45)
        const s = isoToScreen(companion.homeTile)
        const label = this.add
          .text(s.x, s.y + MECH_DISPLAY_SIZE * 0.25, '⚠ NOT DEPLOYABLE', {
            fontSize: '10px',
            color: '#ff4444',
            fontFamily: 'Courier New',
            fontStyle: 'bold',
            stroke: '#000',
            strokeThickness: 3
          })
          .setOrigin(0.5)
          .setDepth(sprite.depth + 1)
        this.unavailableLabels.set(companion.id, label)
      } else if (companion.cliAvailable && hasLabel) {
        sprite.setAlpha(1)
        this.unavailableLabels.get(companion.id)?.destroy()
        this.unavailableLabels.delete(companion.id)
      }
    }

    for (const facility of this.state.facilities) {
      if (this.facilitySprites.has(facility.id)) continue
      const s = isoToScreen(facility.tile)

      const sprite = this.add.image(
        s.x,
        s.y - FACILITY_DISPLAY_H * 0.3,
        FACILITY_KEY[facility.facilityType]
      )
      sprite.setDisplaySize(FACILITY_DISPLAY_W, FACILITY_DISPLAY_H)
      sprite.setDepth(50 + s.y)
      sprite.setInteractive()
      sprite.on('pointerup', () => bus.emit('facilityClicked', { facilityId: facility.id }))
      this.facilitySprites.set(facility.id, sprite)
      this.createFacilityBeacon(facility.id, s, this.state.facilities.indexOf(facility))

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
        this.cancelActiveWalk(id)
        sprite.destroy()
        this.mechSprites.delete(id)
        this.unavailableLabels.get(id)?.destroy()
        this.unavailableLabels.delete(id)
        this.killTween(this.idleBreathTweens, id)
        this.killTween(this.workingSwayTweens, id)
        this.footDustEmitters.get(id)?.destroy()
        this.footDustEmitters.delete(id)
        if (this.selectedCompanionId === id) {
          this.selectedCompanionId = null
          this.destroySelectionRing()
        }
      }
    }
    for (const [id, sprite] of this.facilitySprites) {
      if (!this.state.facilities.some((f) => f.id === id)) {
        sprite.destroy()
        this.facilitySprites.delete(id)
        this.killTween(this.facilityBeaconTweens, id)
        this.facilityBeacons.get(id)?.destroy()
        this.facilityBeacons.delete(id)
        this.killTween(this.workLightTweens, id)
        this.workLights.get(id)?.destroy()
        this.workLights.delete(id)
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
   *
   * The position itself is tweened against a plain `{ t }` progress proxy
   * (not the sprite's x/y directly) so the per-frame walk bob can be
   * composed on top of the interpolated position in the same onUpdate,
   * rather than running a second tween that would fight the position
   * tween over sprite.y every frame.
   */
  walkTo(companionId: string, targetTile: { x: number; y: number }): Promise<void> {
    this.cancelActiveWalk(companionId)
    const sprite = this.mechSprites.get(companionId)
    if (!sprite) return Promise.resolve()
    const target = isoToScreen(targetTile)
    const targetY = target.y - MECH_DISPLAY_SIZE * 0.35
    const startX = sprite.x
    const startY = sprite.y

    sprite.setFlipX(computeFacingFlipX(sprite.flipX, target.x - startX))

    // A mech that's about to walk is no longer idle — stop the breathing
    // loop and reset scaleY so the squash tween (played on arrival) always
    // starts from a clean baseline.
    this.killTween(this.idleBreathTweens, companionId)
    sprite.scaleY = this.baseScaleY(sprite)
    this.startFootDust(companionId, sprite)

    // Swap to the 4-frame walk sheet for the duration of the walk. Guarded
    // by textures.exists so a failed sheet load degrades to the gliding
    // idle sprite instead of Phaser's green __DEFAULT texture.
    const mechClass = sprite.getData('mechClass') as MechClass | undefined
    const walkKey = mechClass ? MECH_WALK_KEY[mechClass] : undefined
    const useWalkFrames =
      !this.reducedMotion && walkKey !== undefined && this.textures.exists(walkKey)
    let currentFrame = 0
    if (useWalkFrames) this.applyMechTexture(sprite, walkKey, 0)

    const progress = { t: 0 }
    let resolveWalk!: () => void
    const promise = new Promise<void>((resolve) => {
      resolveWalk = resolve
    })
    let tween!: Phaser.Tweens.Tween
    tween = this.tweens.add({
      targets: progress,
      t: 1,
      duration: 1500,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        sprite.x = Phaser.Math.Linear(startX, target.x, progress.t)
        const baseY = Phaser.Math.Linear(startY, targetY, progress.t)
        if (this.reducedMotion) {
          sprite.y = baseY
          return
        }
        if (useWalkFrames) {
          const frame = computeWalkFrame(tween.elapsed)
          if (frame !== currentFrame) {
            currentFrame = frame
            sprite.setFrame(frame)
          }
        }
        const bob = computeWalkBob(tween.elapsed)
        sprite.y = baseY + bob.yOffset
        sprite.angle = bob.angleDeg
      },
      onComplete: () => {
        sprite.x = target.x
        sprite.y = targetY
        sprite.angle = 0
        if (useWalkFrames && mechClass) this.applyMechTexture(sprite, MECH_KEY[mechClass])
        this.stopFootDust(companionId)
        this.playArrivalBurst(companionId, sprite)
        if (this.activeWalks.get(companionId)?.tween === tween) {
          this.activeWalks.delete(companionId)
        }
        resolveWalk()
      }
    })
    this.activeWalks.set(companionId, {
      tween,
      promise,
      resolve: resolveWalk,
      cancelled: false
    })
    return promise
  }

  private cancelActiveWalk(companionId: string): void {
    const activeWalk = this.activeWalks.get(companionId)
    if (!activeWalk) return
    activeWalk.cancelled = true
    activeWalk.tween.stop()
    this.activeWalks.delete(companionId)
    this.stopFootDust(companionId)

    const sprite = this.mechSprites.get(companionId)
    const mechClass = sprite?.getData('mechClass') as MechClass | undefined
    if (sprite) {
      if (mechClass && sprite.texture.key === MECH_WALK_KEY[mechClass]) {
        this.applyMechTexture(sprite, MECH_KEY[mechClass])
      }
      sprite.angle = 0
    }
    activeWalk.resolve()
  }

  /**
   * Swap a mech sprite's texture (idle art ↔ walk sheet frame) and re-derive
   * its scale. The idle textures are ~1024px and the walk-sheet cells are
   * 256px, so the raw scale factor that produces a 96px mech differs ~4×
   * between them — setDisplaySize + re-capturing baseScaleY on EVERY swap
   * keeps all relative scale animations (breath, squash) correct. Skipping
   * the re-capture is the same bug class as the v1.1 absolute-scaleY stretch.
   */
  private applyMechTexture(
    sprite: Phaser.GameObjects.Image,
    textureKey: string,
    frame?: number
  ): void {
    sprite.setTexture(textureKey, frame)
    sprite.setDisplaySize(MECH_DISPLAY_SIZE, MECH_DISPLAY_SIZE)
    sprite.setData('baseScaleY', sprite.scaleY)
  }

  /**
   * Reactor-breathing idle loop — a barely-visible scaleY oscillation so
   * mechs standing around don't read as frozen sprites. Each mech gets a
   * random start delay so a room full of idle mechs doesn't breathe in
   * lockstep. No-op if a breath tween is already running for this mech, or
   * under prefers-reduced-motion.
   */
  private startIdleBreath(companionId: string): void {
    if (this.reducedMotion) return
    if (this.idleBreathTweens.has(companionId)) return
    const sprite = this.mechSprites.get(companionId)
    if (!sprite) return
    const tween = this.tweens.add({
      targets: sprite,
      scaleY: this.baseScaleY(sprite) * 1.008,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      delay: Math.random() * 2400,
      ease: 'Sine.easeInOut'
    })
    this.idleBreathTweens.set(companionId, tween)
  }

  /**
   * The sprite's resting scaleY, captured right after setDisplaySize()
   * at creation. All scale animations must be multiples of this — the
   * sprite's "natural" scale is ~0.1 (96px display / full texture size),
   * so tweening toward absolute 1.0 would stretch it ~10× vertically.
   */
  private baseScaleY(sprite: Phaser.GameObjects.Image): number {
    return (sprite.getData('baseScaleY') as number | undefined) ?? sprite.scaleY
  }

  /** Stop and forget a tracked tween, if one exists for this id. */
  private killTween(map: Map<string, Phaser.Tweens.Tween>, id: string): void {
    const tween = map.get(id)
    if (!tween) return
    tween.stop()
    map.delete(id)
  }

  /**
   * Dust puffs at the mech's feet while it walks. Reuses the single
   * 'smoke' texture (tinted warm gray) rather than a dedicated dust asset.
   * One emitter per mech, following the sprite via startFollow so it
   * doesn't need per-frame repositioning from our own code.
   */
  private startFootDust(companionId: string, sprite: Phaser.GameObjects.Image): void {
    if (this.reducedMotion) return
    this.stopFootDust(companionId)
    const feetOffsetY = MECH_DISPLAY_SIZE * 0.42
    const dust = this.add.particles(sprite.x, sprite.y + feetOffsetY, 'smoke', {
      frequency: 250,
      quantity: 1,
      lifespan: 500,
      speed: { min: 5, max: 15 },
      angle: { min: 200, max: 340 }, // biased up-and-outward in screen space
      alpha: { start: 0.5, end: 0 },
      scale: { start: 0.12, end: 0.3 },
      tint: 0x8a8578
    })
    dust.startFollow(sprite, 0, feetOffsetY)
    dust.setDepth(Math.max(1, sprite.depth - 1))
    this.footDustEmitters.set(companionId, dust)
  }

  /** Stop emitting new dust immediately; already-alive particles finish fading on their own. */
  private stopFootDust(companionId: string): void {
    const dust = this.footDustEmitters.get(companionId)
    if (!dust) return
    dust.stop()
    this.footDustEmitters.delete(companionId)
    this.time.delayedCall(500, () => dust.destroy())
  }

  /**
   * Arrival feedback: a small dust burst at the mech's feet plus a quick
   * squash-and-recover on the sprite, then hand back off to idle breathing.
   */
  private playArrivalBurst(companionId: string, sprite: Phaser.GameObjects.Image): void {
    if (!this.reducedMotion) {
      const feetOffsetY = MECH_DISPLAY_SIZE * 0.42
      const burst = this.add.particles(sprite.x, sprite.y + feetOffsetY, 'smoke', {
        lifespan: 500,
        speed: { min: 10, max: 30 },
        angle: { min: 200, max: 340 },
        alpha: { start: 0.6, end: 0 },
        scale: { start: 0.15, end: 0.35 },
        tint: 0x8a8578,
        emitting: false
      })
      burst.setDepth(Math.max(1, sprite.depth - 1))
      burst.explode(6)
      this.time.delayedCall(500, () => burst.destroy())
    }

    const base = this.baseScaleY(sprite)
    this.tweens.add({
      targets: sprite,
      scaleY: base * 0.96,
      duration: 90,
      yoyo: true,
      ease: 'Quad.Out',
      onComplete: () => {
        sprite.scaleY = base
        this.startIdleBreath(companionId)
      }
    })
  }

  /**
   * Dead-in-field: tint the mech gray, fade to 60% alpha, attach a
   * smoke emitter at its feet, and wire a single-shot click handler to
   * recover — restore full color + alpha and walk home. Called on the
   * leading edge of a `failed` transition so it fires exactly once per
   * failed deployment.
   */
  applyDeadInField(companionId: string): void {
    const sprite = this.mechSprites.get(companionId)
    if (!sprite) return

    sprite.setTint(0x666666)
    sprite.setAlpha(0.6)
    this.killTween(this.idleBreathTweens, companionId)
    sprite.scaleY = this.baseScaleY(sprite)

    const smoke = this.add.particles(sprite.x, sprite.y - 10, 'smoke', {
      speed: { min: 10, max: 30 },
      lifespan: 2000,
      alpha: { start: 0.6, end: 0 },
      scale: { start: 0.3, end: 0.9 },
      frequency: 200,
      tint: 0x555555
    })
    smoke.setDepth(sprite.depth + 1)
    this.smokeEmitters.set(companionId, smoke)

    // Disable dragging while dead — otherwise the base render() handlers
    // fire pointerup AFTER dragend and double-trigger recovery. Using
    // pointerdown for recovery also means a stray drag attempt on a dead
    // mech can't accidentally both snap-home AND walk-home.
    this.input.setDraggable(sprite, false)
    sprite.once('pointerdown', () => {
      this.clearDeadInField(companionId)
      const companion = this.state?.companions.find((c) => c.id === companionId)
      if (companion) void this.walkTo(companionId, companion.homeTile)
    })
  }

  private clearDeadInField(companionId: string): void {
    const sprite = this.mechSprites.get(companionId)
    if (sprite) {
      sprite.clearTint()
      sprite.setAlpha(1)
      this.input.setDraggable(sprite, true)
    }
    const smoke = this.smokeEmitters.get(companionId)
    if (smoke) {
      smoke.destroy()
      this.smokeEmitters.delete(companionId)
    }
  }

  private showCompletionBubble(companionId: string, deployment: Deployment): void {
    const sprite = this.mechSprites.get(companionId)
    if (!sprite) return

    const stats = deployment.diffStats
    const message = !stats
      ? '✓ done'
      : stats.filesChanged === 0
        ? '✓ no changes'
        : `✓ ${stats.filesChanged} file${stats.filesChanged === 1 ? '' : 's'} +${stats.insertions} −${stats.deletions}`
    const label = this.add
      .text(0, 0, message, {
        fontFamily: type.mono,
        fontSize: '13px',
        fontStyle: 'bold',
        color: colors.cyan
      })
      .setOrigin(0.5)
    const width = label.width + 12
    const height = label.height + 6
    const background = this.add.graphics()
    const backgroundColor = Phaser.Display.Color.HexStringToColor(colors.bgPanelDark).color
    const borderColor = Phaser.Display.Color.HexStringToColor(colors.cyan).color
    background.fillStyle(backgroundColor, 0.9)
    background.fillRoundedRect(-width / 2, -height / 2, width, height, 4)
    background.lineStyle(1, borderColor, 0.55)
    background.strokeRoundedRect(-width / 2, -height / 2, width, height, 4)

    const bubble = this.add
      .container(sprite.x, sprite.y - MECH_DISPLAY_SIZE * 0.85, [background, label])
      .setDepth(Math.max(1000, sprite.depth + 10))
    this.completionBubbles.add(bubble)
    this.tweens.add({
      targets: bubble,
      y: bubble.y - 30,
      alpha: 0,
      duration: 4000,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.completionBubbles.delete(bubble)
        bubble.destroy()
      }
    })
  }

  /**
   * Track the selected mech and (re)draw its selection ring. The mech
   * sprite's own pointerup handler calls this right after emitting
   * `companionSelected` on the bus — the bus event drives the React-side
   * stats panel, this drives the Phaser-side ring, and neither needs to
   * know about the other.
   */
  private setSelectedCompanion(companionId: string): void {
    if (this.selectedCompanionId === companionId) return
    this.selectedCompanionId = companionId
    this.destroySelectionRing()
    this.createSelectionRing(companionId)
  }

  /**
   * RTS-style selection ring: a pulsing iso-perspective ellipse under the
   * mech's feet. Plays a quick expand-in on first selection, then settles
   * into an infinite alpha pulse. Under reduced motion, the ring is drawn
   * once at a fixed alpha with no pulse and no expand-in.
   */
  private createSelectionRing(companionId: string): void {
    const sprite = this.mechSprites.get(companionId)
    if (!sprite) return

    const ring = this.add.graphics()
    const cyan = Phaser.Display.Color.HexStringToColor(colors.cyan).color
    const ringW = TILE_W * 0.55
    const ringH = ringW / 2
    ring.lineStyle(2, cyan, 1)
    ring.strokeEllipse(0, 0, ringW, ringH)
    ring.setPosition(sprite.x, sprite.y + MECH_DISPLAY_SIZE * 0.42)
    ring.setDepth(Math.max(1, sprite.depth - 1))
    this.selectionRing = ring

    if (this.reducedMotion) {
      ring.setAlpha(0.6)
      return
    }

    ring.setScale(1.4)
    ring.setAlpha(0)
    this.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0.8,
      duration: 200,
      ease: 'Quad.Out',
      onComplete: () => {
        this.selectionRingTween = this.tweens.add({
          targets: ring,
          alpha: 0.35,
          duration: 1200,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        })
      }
    })
  }

  private destroySelectionRing(): void {
    if (this.selectionRingTween) {
      this.selectionRingTween.stop()
      this.selectionRingTween = null
    }
    if (this.selectionRing) {
      this.tweens.killTweensOf(this.selectionRing)
      this.selectionRing.destroy()
      this.selectionRing = null
    }
  }

  /**
   * "Servos active" — a slow rotation sway on the mech, plus a pulsing
   * amber work light near the target facility. Both are torn down together
   * by stopWorkingState() the moment the deployment leaves 'working'
   * (including going straight to 'failed', which also triggers
   * applyDeadInField() in the same reactToDeploymentTransitions pass).
   */
  private startWorkingState(companionId: string, facilityId: string): void {
    this.killTween(this.idleBreathTweens, companionId)
    const sprite = this.mechSprites.get(companionId)
    if (sprite) sprite.scaleY = this.baseScaleY(sprite)

    if (sprite && !this.reducedMotion) {
      const swayTween = this.tweens.add({
        targets: sprite,
        angle: 0.6,
        duration: 1600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      })
      this.workingSwayTweens.set(companionId, swayTween)
    }

    if (this.reducedMotion || this.workLights.has(facilityId)) return
    const facSprite = this.facilitySprites.get(facilityId)
    if (!facSprite) return
    const amber = Phaser.Display.Color.HexStringToColor(colors.amber).color
    const light = this.add
      .image(facSprite.x, facSprite.y - FACILITY_DISPLAY_H * 0.3, 'smoke')
      .setTint(amber)
      .setScale(0.35)
      .setAlpha(0.2)
      .setDepth(facSprite.depth + 1)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.workLights.set(facilityId, light)
    const lightTween = this.tweens.add({
      targets: light,
      alpha: 0.9,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    })
    this.workLightTweens.set(facilityId, lightTween)
  }

  private stopWorkingState(companionId: string, facilityId: string): void {
    this.killTween(this.workingSwayTweens, companionId)
    const sprite = this.mechSprites.get(companionId)
    if (sprite) sprite.angle = 0
    this.startIdleBreath(companionId)

    this.killTween(this.workLightTweens, facilityId)
    const light = this.workLights.get(facilityId)
    if (light) {
      light.destroy()
      this.workLights.delete(facilityId)
    }
  }

  /**
   * Tiny blinking amber beacon on every facility (working or not) so the
   * bay reads as alive even when nothing is deployed. Staggered per-facility
   * period keeps them from blinking in unison. Skipped entirely under
   * reduced motion rather than drawn static — these are pure ambience with
   * no functional meaning, unlike the selection ring.
   */
  private createFacilityBeacon(
    facilityId: string,
    screenPos: { x: number; y: number },
    index: number
  ): void {
    if (this.reducedMotion) return
    const amber = Phaser.Display.Color.HexStringToColor(colors.amber).color
    const beacon = this.add
      .image(screenPos.x, screenPos.y - FACILITY_DISPLAY_H * 0.55, 'smoke')
      .setTint(amber)
      .setScale(0.12)
      .setAlpha(0.1)
      .setDepth(50 + screenPos.y + 1)
    this.facilityBeacons.set(facilityId, beacon)
    const tween = this.tweens.add({
      targets: beacon,
      alpha: 0.8,
      duration: 1800 + index * 230,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    })
    this.facilityBeaconTweens.set(facilityId, tween)
  }

  /**
   * Phaser calls this on scene stop/restart. Particle emitters created
   * via `this.add.particles()` are NOT auto-destroyed with the scene, so
   * they leak GPU resources on repeat shutdowns (rare in the current
   * Electron-single-scene app, but trivial to get right).
   */
  shutdown(): void {
    for (const companionId of [...this.activeWalks.keys()]) {
      this.cancelActiveWalk(companionId)
    }
    this.activeWalks.clear()
    for (const smoke of this.smokeEmitters.values()) {
      smoke.destroy()
    }
    this.smokeEmitters.clear()
    for (const label of this.unavailableLabels.values()) {
      label.destroy()
    }
    this.unavailableLabels.clear()
    for (const bubble of this.completionBubbles) {
      this.tweens.killTweensOf(bubble)
      bubble.destroy()
    }
    this.completionBubbles.clear()

    for (const tween of this.idleBreathTweens.values()) tween.stop()
    this.idleBreathTweens.clear()
    for (const tween of this.workingSwayTweens.values()) tween.stop()
    this.workingSwayTweens.clear()
    for (const dust of this.footDustEmitters.values()) dust.destroy()
    this.footDustEmitters.clear()
    for (const tween of this.workLightTweens.values()) tween.stop()
    this.workLightTweens.clear()
    for (const light of this.workLights.values()) light.destroy()
    this.workLights.clear()
    for (const tween of this.facilityBeaconTweens.values()) tween.stop()
    this.facilityBeaconTweens.clear()
    for (const beacon of this.facilityBeacons.values()) beacon.destroy()
    this.facilityBeacons.clear()
    this.destroySelectionRing()
    this.selectedCompanionId = null
  }

  /**
   * Diff two state snapshots and trigger animations for deployment status
   * transitions. The diff itself is pure (`computeDeploymentActions`) so it
   * can be unit-tested without Phaser; this method just maps actions onto
   * scene effects. Brand-new deployments count as transitions — they are
   * BORN in 'walking-to', so skipping them means mechs never walk (the
   * v1.2.1-and-earlier bug).
   */
  private reactToDeploymentTransitions(prev: AppState, next: AppState): void {
    const actions = computeDeploymentActions(prev.deployments, next.deployments)
    for (const action of actions) {
      switch (action.kind) {
        case 'walk-to-facility': {
          const facility = next.facilities.find((candidate) => candidate.id === action.facilityId)
          if (facility) void this.walkTo(action.companionId, facility.tile)
          break
        }
        case 'start-working': {
          const activeWalk = this.activeWalks.get(action.companionId)
          if (activeWalk) {
            void activeWalk.promise.then(() => {
              if (!activeWalk.cancelled) {
                this.startWorkingState(action.companionId, action.facilityId)
              }
            })
          } else {
            this.startWorkingState(action.companionId, action.facilityId)
          }
          break
        }
        case 'stop-working':
          this.stopWorkingState(action.companionId, action.facilityId)
          break
        case 'dead-in-field':
          this.cancelActiveWalk(action.companionId)
          this.applyDeadInField(action.companionId)
          break
        case 'completion-bubble': {
          const deployment = next.deployments.find(
            (candidate) => candidate.id === action.deploymentId
          )
          if (deployment) this.showCompletionBubble(action.companionId, deployment)
          break
        }
        case 'walk-home': {
          const companion = next.companions.find((candidate) => candidate.id === action.companionId)
          if (companion) void this.walkTo(action.companionId, companion.homeTile)
          break
        }
      }
    }
  }
}
