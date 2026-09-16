/** Check both fallback formats through the last frame, not just loaded metadata. */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const url = process.argv[2] || 'http://localhost:4387/portfolio/'
const output = resolve(import.meta.dirname, '../artifacts/video-compat')
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
    join(process.env.LOCALAPPDATA!, 'ms-playwright/chromium-1217/chrome-win64/chrome.exe'),
  headless: true
})
const checks: unknown[] = []
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    await page.goto(url)
    const card = page.locator('#mechbay')
    await card.scrollIntoViewIfNeeded()
    const video = card.locator('video')
    assert.equal(await video.getAttribute('autoplay'), null)
    assert.equal(await video.getAttribute('preload'), 'none')
    for (const format of ['webm', 'mp4']) {
      const src = await video.locator(`source[type="video/${format}"]`).getAttribute('src')
      assert.ok(src)
      const result = await video.evaluate(async (element: HTMLVideoElement, src: string) => {
        element.pause()
        element.src = src
        element.muted = true
        element.playbackRate = 2
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => finish(new Error('Playback did not reach the end')),
            30000
          )
          const error = (): void =>
            finish(new Error(element.error?.message || 'Video decode failed'))
          const ended = (): void => finish()
          const finish = (failure?: Error): void => {
            clearTimeout(timeout)
            element.removeEventListener('error', error)
            element.removeEventListener('ended', ended)
            if (failure) reject(failure)
            else resolve()
          }
          element.addEventListener('error', error)
          element.addEventListener('ended', ended)
          element.play().catch(finish)
        })
        const quality = element.getVideoPlaybackQuality()
        return {
          source: element.currentSrc,
          duration: element.duration,
          time: element.currentTime,
          width: element.videoWidth,
          height: element.videoHeight,
          ended: element.ended,
          error: element.error?.message || null,
          frames: quality.totalVideoFrames,
          dropped: quality.droppedVideoFrames
        }
      }, src)
      assert.equal(result.ended, true)
      assert.equal(result.error, null)
      assert.equal(result.width, 1280)
      assert.equal(result.height, 800)
      assert.ok(result.duration >= 23 && result.duration <= 25)
      assert.ok(result.frames >= 280, 'The entire clip must decode')
      checks.push({ viewport: width, format, ...result })
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    )
    await card.screenshot({
      path: join(output, `playback-${width}.png`),
      style: 'header, .skip-link, astro-dev-toolbar { visibility: hidden !important; }'
    })
    await page.close()
  }
  writeFileSync(
    join(output, 'playback-verification.json'),
    JSON.stringify({ url, checks }, null, 2)
  )
  console.log(JSON.stringify(checks, null, 2))
} finally {
  await browser.close()
}
