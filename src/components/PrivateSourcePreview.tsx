import { useEffect, useRef } from "react";
import { enabledPlaybackUrl, type PlaybackSource } from "../services/playback";
import SandboxedPlayerFrame from "./SandboxedPlayerFrame";
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
  if (!enabledPlaybackUrl(source.player_type, source.url)) return null;
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
          <SandboxedPlayerFrame
            title={`Prueba privada ${source.name}`}
            url={source.url}
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
