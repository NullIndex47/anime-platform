import { useEffect, useRef } from "react";
import { safePlaybackUrl, type PlaybackSource } from "../services/playback";
export default function PrivateSourcePreview({
  source,
  stop,
}: {
  source: PlaybackSource;
  stop: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (video && !video.hasAttribute("src")) video.src = source.url;
    return () => {
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [source.url]);
  if (!safePlaybackUrl(source.player_type, source.url)) return null;
  return (
    <section
      aria-label="Prueba privada del servidor"
      className="private-source-preview"
    >
      <h4>Prueba privada · {source.name}</h4>
      <p>
        Solo visible en tu editor. Probar el servidor no publica ni guarda el
        episodio.
      </p>
      <div className="video-frame">
        {source.player_type === "iframe" ? (
          <iframe
            title={`Prueba privada ${source.name}`}
            src={source.url}
            allow="fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-presentation"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <video
            ref={ref}
            src={source.url}
            controls
            autoPlay
            playsInline
            preload="metadata"
          />
        )}
      </div>
      <button className="button button-outline" type="button" onClick={stop}>
        Cerrar prueba privada
      </button>
    </section>
  );
}
