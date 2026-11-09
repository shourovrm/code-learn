import type { ExerciseStatus } from '../../../shared/api';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

interface Props {
  status: ExerciseStatus;
  showing: boolean;
  disabled: boolean;
  onShow: () => void;
  onHide: () => void;
}

/** The learner's own view of the reference solution (DESIGN A5): locked until its checks open it, then shown or hidden. */
export function SolutionButton({ status, showing, disabled, onShow, onHide }: Props) {
  if (showing) return <Button variant="ghost" disabled={disabled} onClick={onHide}>Hide solution</Button>;
  if (!status.solutionOpen) {
    return (
      <Button variant="ghost" disabled>
        <Icon name="lock" size={15} />
        Solution
        <span className="quiet-text">{status.checks} of {status.solutionChecks} checks</span>
      </Button>
    );
  }
  return <Button variant="ghost" disabled={disabled} onClick={onShow}>Solution</Button>;
}
