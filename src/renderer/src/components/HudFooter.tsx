export function HudFooter(): React.JSX.Element {
  return (
    <footer className="command-footer">
      <span>
        <i className="status-dot" /> LOCAL SYSTEMS <b>/</b> YOUR AGENTS. YOUR PROJECTS.
      </span>
      <span>
        <kbd>DRAG</kbd> Deploy <b>·</b> <kbd>CLICK</kbd> Inspect <b>·</b> Empty tile to add a
        project
      </span>
      <span className="footer-edition">MECHBAY // COMMAND EDITION</span>
    </footer>
  )
}
