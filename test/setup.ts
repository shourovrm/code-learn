// Runs before every test file. A test that doesn't point CODE_LEARN_HOME at its own folder gets a throwaway one, so
// a check, Run or the self-test (which stage their folders under code-learn's home) never touches the real ~/.code-learn.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

if (!process.env.CODE_LEARN_HOME) {
  const home = mkdtempSync(join(tmpdir(), "code-learn-test-home-"));
  process.env.CODE_LEARN_HOME = home;
  afterAll(() => rmSync(home, { recursive: true, force: true, maxRetries: 3 }));
}
