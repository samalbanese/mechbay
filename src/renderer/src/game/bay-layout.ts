export interface Point {
  x: number
  y: number
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** Convert a Phaser canvas pixel into a CSS pixel relative to the page viewport. */
export function canvasPointToPage(
  point: Point,
  canvasRect: Rect,
  gameSize: { width: number; height: number }
): Point {
  return {
    x: canvasRect.left + point.x * (canvasRect.width / gameSize.width),
    y: canvasRect.top + point.y * (canvasRect.height / gameSize.height)
  }
}
