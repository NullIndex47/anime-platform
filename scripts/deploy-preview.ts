import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import ts from "typescript";

type RawConfig = Record<string, unknown> & {
  main: string;
  assets: Record<string, unknown> & { directory: string };
  previews?: Record<string, unknown> & { vars?: Record<string, unknown> };
};
export function parseConfig(contents: string): RawConfig {
  const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", contents);
  if (parsed.error || !parsed.config?.main || !parsed.config?.assets?.directory)
    throw new Error("Configuración Wrangler no válida.");
  return parsed.config;
}
export function previewConfig(
  raw: RawConfig,
  env: NodeJS.ProcessEnv,
  root: string,
): RawConfig {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))
    throw new Error(
      "Preview requiere VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY públicas y válidas en Builds.",
    );
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("VITE_SUPABASE_URL no válida.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(
      "VITE_SUPABASE_URL debe ser un origen HTTPS sin credenciales.",
    );
  return {
    ...structuredClone(raw),
    main: resolve(root, raw.main),
    ...(typeof raw.tsconfig === "string"
      ? { tsconfig: resolve(root, raw.tsconfig) }
      : {}),
    assets: { ...raw.assets, directory: resolve(root, raw.assets.directory) },
    previews: {
      ...raw.previews,
      vars: {
        ...raw.previews?.vars,
        SUPABASE_URL: url,
        SUPABASE_PUBLISHABLE_KEY: key,
        ANILIST_ENABLED: "false",
      },
    },
  };
}
export function commandArgs(
  configPath: string,
  dryRun: boolean,
  outdir: string,
): string[] {
  // Preview has no --dry-run in pinned Wrangler 4.149.0. Only the validation
  // branch projects Preview vars to deploy --dry-run; it never publishes.
  return dryRun
    ? ["deploy", "--dry-run", "--config", configPath, "--outdir", outdir]
    : ["preview", "--config", configPath];
}
export async function deployPreview(
  dryRun: boolean,
  root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  env: NodeJS.ProcessEnv = process.env,
  run: (args: string[], env: NodeJS.ProcessEnv) => Promise<number> = argsRunner,
) {
  // Validate before writing anything or starting Wrangler. Never fall back to
  // Production credentials or guess placeholder values.
  const raw = parseConfig(
    await readFile(resolve(root, "wrangler.jsonc"), "utf8"),
  );
  const config = previewConfig(raw, env, root);
  await mkdir(resolve(root, "work"), { recursive: true });
  const directory = await mkdtemp(resolve(root, "work/preview-runtime-"));
  try {
    const path = resolve(directory, "wrangler.preview.json");
    const effective = dryRun
      ? { ...config, ...config.previews, vars: config.previews!.vars }
      : config;
    await writeFile(path, JSON.stringify(effective), { mode: 0o600 });
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
      const code = await deployPreview(args.includes("--dry-run"));
      if (code) {
        console.error(
          "Wrangler no completó la operación Preview. Revisa permisos Cloudflare, versión fijada y configuración de Builds. La salida con bindings no se imprime.",
        );
        process.exitCode = code;
      } else
        console.log(
          args.includes("--dry-run")
            ? "Dry-run local de Runtime Preview correcto; no se ha publicado."
            : "Preview creada con Runtime Supabase y AniList desactivado. Consulta la URL en Cloudflare.",
        );
    } catch {
      console.error(
        "No se pudo preparar Runtime Preview. Revisa las dos variables públicas VITE_SUPABASE_* y wrangler.jsonc; no uses claves secretas.",
      );
      process.exitCode = 1;
    }
  }
}
