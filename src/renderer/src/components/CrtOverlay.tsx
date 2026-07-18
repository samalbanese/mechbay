export function CrtOverlay(): React.JSX.Element {
  return <div aria-hidden="true" style={overlayStyle} />
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  pointerEvents: 'none',
  background: `
    repeating-linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0) 0,
      rgba(0, 0, 0, 0) 2px,
      rgba(0, 0, 0, 0.035) 3px,
      rgba(0, 0, 0, 0.035) 4px
    ),
    radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 58%, rgba(0, 0, 0, 0.25) 100%)
  `
}
