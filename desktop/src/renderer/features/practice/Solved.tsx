import type { ExerciseStatus } from '../../../shared/api';
import { shortDate } from './Results';

/** The green card at the top of a statement whose exercise has a passed check (DESIGN E). */
export function Solved({ solved }: { solved: NonNullable<ExerciseStatus['solved']> }) {
  return (
    <div className="solved">
      <p><b>Solved on {shortDate(solved.at)}</b> · {solved.passed} of {solved.total} passed</p>
      <p>Your passing code is in the editor.</p>
    </div>
  );
}
