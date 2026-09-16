import type { AppState } from '../../../shared/types'
import { CREW, RUNTIME_NAMES } from '../crew'
import { currentMission, STATUS_LABELS } from '../operations'

export function CrewRoster({
  state,
  selectedId,
  onSelect
}: {
  state: AppState | null
  selectedId: string | null
  onSelect: (id: string) => void
}): React.JSX.Element {
  return (
    <section className="crew-roster" aria-label="Mech crew">
      <div className="section-caption">
        <span>
          <i className="tiny-cross">+</i> YOUR CREW
        </span>
        <span>SELECT A MECH TO COMMAND</span>
      </div>
      <div className="crew-grid">
        {state?.companions.map((companion, index) => {
          const profile = CREW[companion.mechClass]
          const mission = currentMission(companion.id, state.deployments)
          return (
            <button
              key={companion.id}
              className={`crew-card ${selectedId === companion.id ? 'is-selected' : ''}`}
              aria-pressed={selectedId === companion.id}
              onClick={() => onSelect(companion.id)}
              aria-label={`Select ${companion.name}`}
            >
              <span className="crew-number">
                0{index + 1} / {profile.code}
              </span>
              <img src={profile.image} alt="" className="crew-portrait" />
              <span className="crew-name">{companion.name.replace(/-Prime$/i, '')}</span>
              <span className="crew-runtime">
                {RUNTIME_NAMES[companion.runtime ?? companion.family]}
              </span>
              <span
                className={`crew-status ${mission ? 'engaged' : companion.cliAvailable ? 'ready' : 'offline'}`}
              >
                <i />
                {mission
                  ? STATUS_LABELS[mission.status]
                  : companion.cliAvailable
                    ? 'Ready'
                    : 'Setup needed'}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
