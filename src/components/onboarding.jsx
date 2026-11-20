import { Badge, Progress } from './ui';

const ACCESS = { NOT_STARTED: ['neutral', 'Not yet'], GRANTED: ['warn', 'Granted: Webinger to check'], VERIFIED: ['ok', 'Working'], NOT_NEEDED: ['neutral', 'Not needed'] };
export const AccessBadge = ({ status }) => <Badge tone={ACCESS[status][0]}>{ACCESS[status][1]}</Badge>;

export const QUESTIONS = [
  ['about', 'What does your business do?'],
  ['audience', 'Who are your customers?'],
  ['competitors', 'Who are your main competitors?'],
  ['goals', 'What should the next 3 months achieve?'],
  ['voice', 'How should your brand sound?'],
  ['avoid', 'Anything we must never say or show?'],
];

export function OnboardingProgress({ o }) {
  return (
    <div className="grid" style={{ gap: 8 }}>
      <div className="row bar-row">
        <Progress value={o.progress} label="Onboarding complete" />
        <span className="small">{o.progress}%</span>
      </div>
      <ul className="onboard-steps small">
        <li className={o.questionnaireDone ? 'is-done' : undefined}>Brand questionnaire</li>
        <li className={o.access.every((a) => a.status !== 'NOT_STARTED') ? 'is-done' : undefined}>
          Access handover ({o.access.filter((a) => a.status !== 'NOT_STARTED').length}/{o.access.length})
        </li>
        <li className={o.brandAssetsUploaded ? 'is-done' : undefined}>Brand files in the vault</li>
        <li className={o.kickoff ? 'is-done' : undefined}>Kick-off call booked</li>
      </ul>
    </div>
  );
}
