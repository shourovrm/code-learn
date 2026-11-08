// @vitest-environment node
import { createMock, type MockOptions } from './mock';
import { codeLearnApiContract } from './testing/contract';

codeLearnApiContract('the mock', () => {
  const options: MockOptions = {};
  return { api: createMock(options), stopDocker: () => void (options.docker = 'stopped') };
});
