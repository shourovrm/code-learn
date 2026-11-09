import { useEffect, useState } from 'react';
import type { ExerciseStatus } from '../../../shared/api';
import { useApi } from '../../app/api';
import { useRouter } from '../../app/router';
import type { Shown } from './Results';

/** The exercise's recorded checks, read again after each result, since a check is what records one. */
export function useExerciseStatus(activityId: string, shown: Shown): ExerciseStatus | undefined {
  const api = useApi();
  const { fail } = useRouter();
  const [status, setStatus] = useState<ExerciseStatus>();
  useEffect(() => {
    let live = true;
    api.exerciseStatus(activityId).then((next) => live && setStatus(next), fail);
    return () => void (live = false);
  }, [api, activityId, shown, fail]);
  return status;
}
