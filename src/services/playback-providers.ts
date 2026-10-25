export interface PlaybackProvider {
  id: string;
  name: string;
  type: "iframe" | "html5";
  patterns: readonly RegExp[];
  help: string;
  placeholder: string;
  publicLink?: { pattern: RegExp; embed: (id: string) => string };
  iframePolicy?: {
    sandbox: string;
    allow: string;
  };
}

// Preserve the established YouTube/Vimeo capabilities. The newly reviewed
// video-only integrations do not get Presentation API or encrypted-media access.
const establishedFramePolicy = {
  sandbox: "allow-scripts allow-same-origin allow-presentation",
  allow: "fullscreen; picture-in-picture; encrypted-media",
};
const videoFramePolicy = {
  sandbox: "allow-scripts allow-same-origin",
  allow: "fullscreen; picture-in-picture",
};

// Reviewed origins and routes only. Evidence and pending providers:
// docs/phase-3e-providers.md. Canonical patterns also live in the NEW SQL migration.
export const playbackProviders: readonly PlaybackProvider[] = [
  {
    id: "youtube",
    name: "YouTube",
    type: "iframe",
    iframePolicy: establishedFramePolicy,
    patterns: [
      /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}$/,
    ],
    help: "URL de inserción de YouTube sin cookies, sin parámetros.",
    placeholder: "https://www.youtube-nocookie.com/embed/…",
  },
  {
    id: "vimeo",
    name: "Vimeo",
    type: "iframe",
    iframePolicy: establishedFramePolicy,
    patterns: [/^https:\/\/player\.vimeo\.com\/video\/[0-9]+$/],
    help: "URL de inserción de Vimeo con identificador numérico, sin parámetros.",
    placeholder: "https://player.vimeo.com/video/…",
  },
  {
    id: "streamtape",
    name: "Streamtape",
    type: "iframe",
    iframePolicy: videoFramePolicy,
    patterns: [/^https:\/\/streamtape\.com\/e\/[A-Za-z0-9]+$/],
    publicLink: {
      pattern:
        /^https:\/\/streamtape\.com\/v\/([A-Za-z0-9]+)(\/[A-Za-z0-9_.-]+)?$/,
      embed: (id) => `https://streamtape.com/e/${id}`,
    },
    help: "Inserción streamtape.com/e/… o enlace público /v/…; se convierte al salir del campo. Sin parámetros ni dominios espejo.",
    placeholder: "https://streamtape.com/e/…",
  },
  {
    id: "uqload",
    name: "Uqload",
    type: "iframe",
    iframePolicy: videoFramePolicy,
    patterns: [
      /^https:\/\/uqload\.vc\/e\/[a-z0-9]{12}\?strm[0-9]+\.uqload\.vc\/i\/[0-9]{2}\/[0-9]{5}\/[a-z0-9]{12}$/,
    ],
    help: "Copia solo la URL completa de «Embed Code»: uqload.vc/e/…?strm…. No se convierten enlaces públicos ni se admiten otros parámetros.",
    placeholder: "https://uqload.vc/e/…?strm…",
  },
  {
    id: "html5",
    name: "Vídeo HTML5",
    type: "html5",
    patterns: [
      /^https:\/\/media\.w3\.org\/2010\/05\/[A-Za-z0-9_./-]+\.(mp4|webm)$/,
      /^https:\/\/archive\.org\/download\/[A-Za-z0-9_./-]+\.(mp4|webm)$/,
    ],
    help: "MP4 o WebM propio o autorizado en media.w3.org/2010/05 o archive.org/download. Sin parámetros.",
    placeholder: "https://archive.org/download/…/video.mp4",
  },
];

export const pendingPlaybackProviders = [
  {
    name: "Netu",
    reason:
      "Su integración principal usa un cargador JavaScript. El iframe alternativo y sus dominios necesitan verificación con contenido autorizado y el aislamiento de YORU.",
  },
  {
    name: "StreamWish",
    reason:
      "La documentación pública consultada no verifica un formato de inserción y dominio estable. Pendiente de una URL oficial autorizada.",
  },
  {
    name: "EarnVids",
    reason:
      "La API pública no documenta la URL de inserción. Pendiente de verificar un reproductor oficial autorizado y sus dominios.",
  },
] as const;

function safeInput(value: string) {
  return (
    value.length <= 2000 && !/[\s\\%]/.test(value) && !value.includes("..")
  );
}

/** Strict canonical playback URL: public/share links are never mounted directly. */
export function playbackProvider(type: string, value: string) {
  return safeInput(value)
    ? playbackProviders.find(
        (p) => p.type === type && p.patterns.some((r) => r.test(value)),
      )
    : undefined;
}

export function playbackIframePolicy(value: string) {
  return playbackProvider("iframe", value)?.iframePolicy;
}

/** Local, documented conversion only. No network, redirects or HTML parsing. */
export function resolvePlaybackInput(value: string) {
  if (!safeInput(value)) return undefined;
  for (const provider of playbackProviders) {
    if (provider.patterns.some((r) => r.test(value)))
      return { provider, url: value };
    const match = provider.publicLink?.pattern.exec(value);
    if (match) {
      const url = provider.publicLink!.embed(match[1]);
      if (playbackProvider(provider.type, url)?.id === provider.id)
        return { provider, url };
    }
  }
  return undefined;
}
