import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { tempDir } from "./temp.js";

/**
 * Points CODE_LEARN_MICROMAMBA at a fake micromamba for one test. It answers `--version` on the host and, inside the
 * install sandbox, `create`: it makes /opt/env/bin and one conda-meta record per package, then runs `extra`, a
 * POSIX sh snippet for the scenario (print an error and exit 1, for example). Undo it with vi.unstubAllEnvs().
 */
export function fakeMicromamba(extra = ""): string {
  const dir = tempDir("code-learn-fake-micromamba-");
  const bin = join(dir, "micromamba");
  writeFileSync(
    bin,
    `#!/bin/sh
if [ "$1" = --version ]; then echo 2.9.0; exit 0; fi
[ "$1" = create ] || { echo "fake micromamba: unexpected $*" >&2; exit 2; }
shift
prefix=
packages=
while [ $# -gt 0 ]; do
  case "$1" in
    --prefix) prefix=$2; shift ;;
    --channel) shift ;;
    --*) ;;
    *) packages="$packages $1" ;;
  esac
  shift
done
mkdir -p "$prefix/bin" "$prefix/conda-meta"
for p in $packages; do
  name=$(echo "$p" | sed 's/[=<>!].*//')
  echo '{}' > "$prefix/conda-meta/$name-1.0-0.json"
done
printf '#!/bin/sh\\necho fake-tool "$@"\\n' > "$prefix/bin/fake-tool"
chmod +x "$prefix/bin/fake-tool"
echo "Transaction finished"
${extra}
`,
  );
  chmodSync(bin, 0o755);
  vi.stubEnv("CODE_LEARN_MICROMAMBA", bin);
  return bin;
}
