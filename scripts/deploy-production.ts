import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { parseConfig, previewConfig } from "./deploy-preview";

export function productionConfig(
  raw: ReturnType<typeof parseConfig>,
  env: NodeJS.ProcessEnv,
  root: string,
): ReturnType<typeof parseConfig> & { vars: Record<string, unknown> } {
  const validated = previewConfig(raw, env, root);
  return {
    ...validated,
    previews: structuredClone(raw.previews),
    vars: {
      ...(raw.vars as Record<string, unknown>),
      SUPABASE_URL: validated.previews!.vars!.SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY:
        validated.previews!.vars!.SUPABASE_PUBLISHABLE_KEY,
      ANILIST_ENABLED: "false",
    },
  };
}
export function commandArgs(
  configPath: string,
  dryRun: boolean,
  outdir: string,
): string[] {
  // Both paths target the existing Production Worker. Validation always adds --dry-run.
  return dryRun
    ? ["deploy", "--dry-run", "--config", configPath, "--outdir", outdir]
    : ["deploy", "--config", configPath];
}
export async function deployProduction(
  dryRun: boolean,
  root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  env: NodeJS.ProcessEnv = process.env,
  run: (args: string[], env: NodeJS.ProcessEnv) => Promise<number> = argsRunner,
) {
  // Validate before writing anything or starting Wrangler. Never fall back to
  // other credentials or guess placeholder values.
  const raw = parseConfig(
    await readFile(resolve(root, "wrangler.jsonc"), "utf8"),
  );
  const config = productionConfig(raw, env, root);
  await mkdir(resolve(root, "work"), { recursive: true });
  const directory = await mkdtemp(resolve(root, "work/production-runtime-"));
  try {
    const path = resolve(directory, "wrangler.production.json");
    await writeFile(path, JSON.stringify(config), { mode: 0o600 });
    const childEnv = {
      ...env,
      WRANGLER_LOG_PATH: resolve(directory, "wrangler.log"),
      WRANGLER_SEND_METRICS: "false",
      XDG_CONFIG_HOME:
        env.XDG_CONFIG_HOME || resolve(root, "work/wrangler-config"),
    };
    return await run(
      commandArgs(path, dryRun, resolve(directory, "bundle")),
      childEnv,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
async function argsRunner(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const cli = resolve(
    dirname(fileURLToPath(import.meta.resolve("wrangler/package.json"))),
    "bin/wrangler.js",
  );
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Wrangler can print plaintext vars. Consume both streams without echoing
    // them; private diagnostic files are removed with the temporary config.
    child.stdout.resume();
    child.stderr.resume();
    child.on("error", () => reject(new Error("No se pudo iniciar Wrangler.")));
    child.on("close", (code) => done(code ?? 1));
  });
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--dry-run")) {
    console.error(
      "Solo se admite --dry-run; no se aceptan comandos ni overrides de Production.",
    );
    process.exitCode = 1;
  } else {
    try {
      const code = await deployProduction(args.includes("--dry-run"));
      if (code) {
        console.error(
          "Wrangler no completó la operación Production. Revisa permisos Cloudflare, versión fijada y configuración de Builds. La salida con bindings no se imprime.",
        );
        process.exitCode = code;
      } else
        console.log(
          args.includes("--dry-run")
            ? "Dry-run local de Runtime Production correcto; no se ha publicado."
            : "Production actualizada con Runtime Supabase y AniList desactivado. Consulta la URL en Cloudflare.",
        );
    } catch {
      console.error(
        "No se pudo preparar Runtime Production. Revisa las dos variables públicas VITE_SUPABASE_* y wrangler.jsonc; no uses claves secretas.",
      );
      process.exitCode = 1;
    }
  }
}
