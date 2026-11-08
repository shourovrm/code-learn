// @vitest-environment node
import { codeLearnApiContract } from './testing/contract';
import { live } from './testing/fakes';

codeLearnApiContract('live, over a fake core and fake agents', () => {
  const t = live();
  return { api: t.api, stopSandbox: () => void (t.c.down = true) };
});
