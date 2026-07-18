/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const MAIN_ENTRY = join(REPO_ROOT, 'out', 'main', 'index.js')
const FRAMES_DIR = join(REPO_ROOT, 'artifacts', 'demo-frames')
const OUTPUT_PATH = join(REPO_ROOT, 'docs', 'demo.gif')
const FRAME_INTERVAL_MS = 110
const INPUT_FRAMERATE = 9
const SPEEDUP = 1.35
const MAX_BYTES = 15 * 1024 * 1024

function log(message) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false })
  console.log(`[capture:demo ${time}] ${message}`)
}

function fail(message) {
  throw new Error(message)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    ...options
  })
  if (result.error) fail(`${command} could not start: ${result.error.message}`)
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    fail(`${command} exited with code ${result.status}${detail ? `:\n${detail}` : ''}`)
  }
  return result
}

function preflight() {
  if (!existsSync(MAIN_ENTRY)) {
    log('Built Electron entry not found; running npm run build...')
    run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
      stdio: 'inherit',
      encoding: undefined
    })
  }
  if (!existsSync(MAIN_ENTRY)) {
    fail(`Build did not create ${MAIN_ENTRY}. Run "npm run build" and try again.`)
  }

  const ffmpeg = run('ffmpeg', ['-version'])
  log(`Preflight OK (${ffmpeg.stdout.split(/\r?\n/, 1)[0]}).`)
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

async function createCursor(page) {
  await page.evaluate(() => {
    document.getElementById('__mechbayCaptureCursor')?.remove()
    const cursor = document.createElement('div')
    cursor.id = '__mechbayCaptureCursor'
    Object.assign(cursor.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '14px',
      height: '14px',
      marginLeft: '-7px',
      marginTop: '-7px',
      border: '2px solid #ffb000',
      borderRadius: '50%',
      boxSizing: 'border-box',
      boxShadow: '0 0 8px rgba(255, 176, 0, .9)',
      pointerEvents: 'none',
      zIndex: '2147483647',
      transform: 'translate3d(80px, 110px, 0)'
    })
    document.body.appendChild(cursor)
  })
  await page.mouse.move(80, 110)
}

function cursorController(page) {
  let current = { x: 80, y: 110 }

  const moveCursor = async (x, y, ms = 650, steps = 15) => {
    const start = current
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps
      const eased =
        progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2
      const next = {
        x: start.x + (x - start.x) * eased,
        y: start.y + (y - start.y) * eased
      }
      await Promise.all([
        page.evaluate(
          ({ nextX, nextY }) => {
            const cursor = document.getElementById('__mechbayCaptureCursor')
            if (cursor) cursor.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`
          },
          { nextX: next.x, nextY: next.y }
        ),
        page.mouse.move(next.x, next.y)
      ])
      await delay(ms / steps)
    }
    current = { x, y }
  }

  const moveToLocator = async (locator, ms = 650) => {
    const box = await locator.boundingBox()
    if (!box) fail('A visible control disappeared before the cursor could reach it.')
    await moveCursor(box.x + box.width / 2, box.y + box.height / 2, ms)
  }

  return { moveCursor, moveToLocator }
}

function startFrameCapture(page) {
  let frameNumber = 0
  let inFlight = null
  let captureError = null
  let stopped = false

  const capture = () => {
    if (stopped || inFlight) return
    const path = join(FRAMES_DIR, `frame-${String(frameNumber).padStart(5, '0')}.jpg`)
    inFlight = page
      .screenshot({ path, type: 'jpeg', quality: 80 })
      .then(() => {
        frameNumber += 1
      })
      .catch((error) => {
        captureError = error
        stopped = true
      })
      .finally(() => {
        inFlight = null
      })
  }

  capture()
  const interval = setInterval(capture, FRAME_INTERVAL_MS)

  return async () => {
    stopped = true
    clearInterval(interval)
    if (inFlight) await inFlight
    if (captureError) fail(`Frame capture failed: ${captureError.message}`)
    if (frameNumber === 0) fail('No demo frames were captured.')
    log(`Captured ${frameNumber} JPEG frames.`)
    return frameNumber
  }
}

async function findDemoTargets(page) {
  await page.waitForFunction(
    () => Boolean(window.__mechbayBayLayout && window.__mechbayState),
    undefined,
    { timeout: 15_000, polling: 100 }
  )

  const targets = await page.evaluate(() => {
    const state = window.__mechbayState
    const layout = window.__mechbayBayLayout
    if (!state || !layout) return null
    const atlas = state.companions.find(
      (companion) => companion.name.toLowerCase() === 'atlas-prime'
    )
    const linkedFacilities = state.facilities.filter((facility) => facility.path.trim().length > 0)
    const facility =
      linkedFacilities.find((candidate) => candidate.name.toLowerCase() === 'research lab') ??
      linkedFacilities[0]
    if (!atlas || !facility) return null
    const mechPoint = layout.mechs[atlas.id]
    const facilityPoint = layout.facilities[facility.id]
    if (!mechPoint || !facilityPoint) return null
    return {
      atlas: { id: atlas.id, name: atlas.name, ...mechPoint },
      facility: { id: facility.id, name: facility.name, ...facilityPoint }
    }
  })

  if (!targets) {
    fail('Demo layout was published, but Atlas-Prime or the linked demo facility was missing.')
  }
  return targets
}

async function choreograph(page, cursor) {
  log('Waiting for the demo-only bay layout hook...')
  const targets = await findDemoTargets(page)
  log(`Targets found: ${targets.atlas.name} -> ${targets.facility.name}.`)

  log('Opening shot: allowing the boot splash to finish.')
  await delay(3_000)
  await delay(1_000)

  log('Dragging Atlas-Prime to the linked facility.')
  await cursor.moveCursor(targets.atlas.x, targets.atlas.y, 750)
  await page.mouse.down()
  await cursor.moveCursor(targets.facility.x, targets.facility.y, 1_000, 20)
  await page.mouse.up()

  const deployDialog = page
    .getByRole('dialog')
    .filter({ hasText: /DEPLOY:/ })
    .first()
  await deployDialog.waitFor({ state: 'visible', timeout: 8_000 })
  const exploreChip = deployDialog.getByRole('button', { name: /Explore quick prompt/i }).first()
  if (await exploreChip.isVisible().catch(() => false)) {
    log('Selecting the Explore quick prompt.')
    await cursor.moveToLocator(exploreChip, 550)
    const exploreCenter = await centerOf(exploreChip)
    await page.mouse.click(exploreCenter.x, exploreCenter.y)
  } else {
    log('Explore chip unavailable; entering the fallback reactor-survey prompt.')
    const textarea = deployDialog.getByRole('textbox', { name: 'Task prompt' })
    await cursor.moveToLocator(textarea, 500)
    await textarea.fill('Survey the reactor and log calibration telemetry.')
  }

  await delay(350)
  const deployButton = deployDialog
    .locator('button')
    .filter({ hasText: /DEPLOY/ })
    .last()
  await deployButton.waitFor({ state: 'visible' })
  await cursor.moveToLocator(deployButton, 500)
  const deployCenter = await centerOf(deployButton)
  await page.mouse.click(deployCenter.x, deployCenter.y)
  await deployDialog.waitFor({ state: 'hidden', timeout: 8_000 })

  log('Mission underway: capturing SimRunner log streaming and mech motion for 26 seconds.')
  const driftTowardLog = (async () => {
    await delay(8_000)
    // Show the streaming mission log — the core promise of the demo. The
    // right panel defaults to the Journal tab once a mech is selected, so
    // actually click LIVE LOG rather than just drifting toward it.
    const liveLog = page.getByRole('button', { name: 'LIVE LOG' }).first()
    if (await liveLog.isVisible().catch(() => false)) {
      await cursor.moveToLocator(liveLog, 900)
      const logCenter = await centerOf(liveLog)
      await page.mouse.click(logCenter.x, logCenter.y)
    } else {
      await cursor.moveCursor(1_100, 390, 900)
    }
  })()
  await Promise.all([delay(26_000), driftTowardLog])

  log('Waiting for the mission debrief with real diff telemetry.')
  const debrief = page
    .getByRole('dialog')
    .filter({ hasText: /MISSION DEBRIEF/ })
    .first()
  await debrief.waitFor({ state: 'visible', timeout: 15_000 })
  await delay(4_000)

  log('Playing the capture-only outro.')
  await page.evaluate(() => {
    const cursorElement = document.getElementById('__mechbayCaptureCursor')
    if (cursorElement) cursorElement.style.opacity = '0'
    const outro = document.createElement('div')
    outro.id = '__mechbayCaptureOutro'
    outro.textContent = 'A BattleTech-inspired command bay for AI coding agents.'
    Object.assign(outro.style, {
      position: 'fixed',
      inset: '0',
      display: 'grid',
      placeItems: 'center',
      padding: '64px',
      background: '#080604',
      color: '#ffb000',
      font: 'bold 24px "Courier New", monospace',
      letterSpacing: '.08em',
      textAlign: 'center',
      textShadow: '0 0 14px rgba(255, 176, 0, .65)',
      opacity: '0',
      transition: 'opacity 700ms ease-out',
      zIndex: '2147483647'
    })
    document.body.appendChild(outro)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        outro.style.opacity = '1'
      })
    )
  })
  await delay(2_500)
}

async function centerOf(locator) {
  const box = await locator.boundingBox()
  if (!box) fail('A visible control disappeared before it could be clicked.')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

function ffmpegFilter(width, fps) {
  return `setpts=PTS/${SPEEDUP},fps=${fps},scale=${width}:-1:flags=lanczos`
}

function assembleGif(frameCount) {
  const attempts = [
    { width: 1280, fps: 10 },
    { width: 1280, fps: 8 },
    { width: 1080, fps: 8 }
  ]

  for (const attempt of attempts) {
    const filter = ffmpegFilter(attempt.width, attempt.fps)
    log(`Encoding GIF at ${attempt.width}px wide / ${attempt.fps} fps...`)
    run(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-framerate',
        String(INPUT_FRAMERATE),
        '-i',
        'frame-%05d.jpg',
        '-vf',
        `${filter},palettegen=stats_mode=diff`,
        'palette.png'
      ],
      { cwd: FRAMES_DIR }
    )
    run(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-framerate',
        String(INPUT_FRAMERATE),
        '-i',
        'frame-%05d.jpg',
        '-i',
        'palette.png',
        '-lavfi',
        `[0:v]${filter}[scaled];[scaled][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`,
        '-loop',
        '0',
        OUTPUT_PATH
      ],
      { cwd: FRAMES_DIR }
    )

    const bytes = statSync(OUTPUT_PATH).size
    const sizeMiB = bytes / 1024 / 1024
    if (bytes <= MAX_BYTES) {
      const duration = probeDuration() ?? frameCount / INPUT_FRAMERATE / SPEEDUP
      log(`Created ${OUTPUT_PATH}`)
      log(`Final duration: ${duration.toFixed(1)}s; file size: ${sizeMiB.toFixed(2)} MiB.`)
      return
    }
    log(`${sizeMiB.toFixed(2)} MiB exceeds 15 MiB; retrying with a leaner encode.`)
  }

  fail(`GIF is still larger than 15 MiB after fallback encoding: ${OUTPUT_PATH}`)
}

function probeDuration() {
  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      OUTPUT_PATH
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  )
  if (result.status !== 0) return null
  const duration = Number.parseFloat(result.stdout.trim())
  return Number.isFinite(duration) ? duration : null
}

async function capture() {
  let electronApp
  let stopCapture
  let frameCount = 0
  try {
    const { _electron } = await import('playwright-core')
    log('Launching Electron in isolated demo mode...')
    electronApp = await _electron.launch({
      args: ['.', '--demo'],
      cwd: REPO_ROOT,
      env: { ...process.env, MECHBAY_DEMO: '1' }
    })
    const page = await electronApp.firstWindow()
    // Windows rounds frame metrics under fractional DPI scaling, so a single
    // setContentSize can come back a couple of pixels off (e.g. 1282x721).
    // Re-apply after setResizable and accept a small delta — ffmpeg rescales
    // every frame to 1280 wide during assembly, so ±4px is invisible.
    const contentSize = await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      if (!window) throw new Error('MechBay BrowserWindow was not created.')
      window.setResizable(false)
      for (let attempt = 0; attempt < 3; attempt += 1) {
        window.setContentSize(1280, 720)
        const [width, height] = window.getContentSize()
        if (width === 1280 && height === 720) break
      }
      return window.getContentSize()
    })
    if (Math.abs(contentSize[0] - 1280) > 4 || Math.abs(contentSize[1] - 720) > 4) {
      fail(`Electron content area is ${contentSize.join('x')}, expected ~1280x720.`)
    }
    log(`Content area: ${contentSize.join('x')}.`)
    await page.waitForFunction(
      () => Math.abs(innerWidth - 1280) <= 4 && Math.abs(innerHeight - 720) <= 4,
      undefined,
      { timeout: 5_000 }
    )

    await createCursor(page)
    const cursor = cursorController(page)
    stopCapture = startFrameCapture(page)
    await choreograph(page, cursor)
    frameCount = await stopCapture()
    stopCapture = null
  } finally {
    if (stopCapture) {
      try {
        frameCount = await stopCapture()
      } catch (error) {
        console.error(`[capture:demo] ${error.message}`)
      }
    }
    if (electronApp) {
      log('Closing Electron.')
      await electronApp.close().catch((error) => {
        console.warn(`[capture:demo] Electron did not close cleanly: ${error.message}`)
      })
    }
  }
  return frameCount
}

async function main() {
  preflight()
  rmSync(FRAMES_DIR, { recursive: true, force: true })
  mkdirSync(FRAMES_DIR, { recursive: true })

  let succeeded = false
  try {
    const frameCount = await capture()
    if (readdirSync(FRAMES_DIR).filter((name) => name.endsWith('.jpg')).length !== frameCount) {
      fail('Captured frame count does not match the files written to disk.')
    }
    assembleGif(frameCount)
    succeeded = true
  } finally {
    if (succeeded) {
      rmSync(FRAMES_DIR, { recursive: true, force: true })
      log('Removed temporary frames.')
    } else {
      log(`Capture failed; keeping debugging frames in ${FRAMES_DIR}.`)
    }
  }
}

main().catch((error) => {
  console.error(
    `\n[capture:demo] FAILED: ${error instanceof Error ? error.message : String(error)}`
  )
  process.exitCode = 1
})
