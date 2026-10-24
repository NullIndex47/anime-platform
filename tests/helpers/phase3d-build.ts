import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, symlink } from "node:fs/promises";
import { resolve } from "node:path";
const run = promisify(execFile);
export const phase3dCommit = "4f668bc8b7b10070db8721c828461eeb10c9cb6d";
export async function phase3dBuild(project: string) {
  const directory = resolve(
      "work",
      `baseline-3d-${phase3dCommit.slice(0, 8)}-${project}`,
    ),
    dist = resolve(directory, "dist");
  try {
    await access(resolve(dist, "index.html"));
    return dist;
  } catch {
    /* first run */
  }
  await mkdir(directory, { recursive: true });
  const archive = resolve(directory, "source.tar");
  await run("git", [
    "archive",
    phase3dCommit,
    "--format=tar",
    `--output=${archive}`,
  ]);
  await run("tar", ["-xf", archive, "-C", directory]);
  try {
    await symlink(
      resolve("node_modules"),
      resolve(directory, "node_modules"),
      "dir",
    );
  } catch {
    /* already prepared */
  }
  await run(
    process.execPath,
    [resolve("node_modules/vite/bin/vite.js"), "build"],
    {
      cwd: directory,
      env: {
        ...process.env,
        VITE_SUPABASE_URL: "https://yoru-auth-test.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
      },
      maxBuffer: 2_000_000,
    },
  );
  return dist;
}
