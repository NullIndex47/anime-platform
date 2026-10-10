import { useCallback, useState } from "react";
import {
  MonitorPlay,
  CircleCheck,
  LockKeyhole,
  AlertTriangle,
} from "lucide-react";
import { demoServers } from "../data/anime";
export function DemoPlayer({ poster }: { poster: string }) {
  const [selected, setSelected] = useState("local");
  const [failed, setFailed] = useState(false);
  const server = demoServers.find((item) => item.id === selected)!;
  // React calls the ref cleanup when an episode, source or error removes the
  // video. Capture this node rather than a ref that may already point elsewhere.
  const attachVideo = useCallback((video: HTMLVideoElement | null) => {
    if (!video) return;
    // StrictMode also rehearses ref cleanup/setup on the same mounted node.
    if (server.source) video.setAttribute("src", server.source);
    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [server.source]);
  return (
    <section
      className="player-section"
      aria-label="Reproductor de demostración"
    >
      <div className="player-frame">
        {failed ? (
          <div className="player-error" role="alert">
            <AlertTriangle size={32} />
            <h2>No se pudo cargar el clip de prueba</h2>
            <p>
              Comprueba que el archivo local de demostración esté disponible.
            </p>
            <button
              className="button button-outline"
              onClick={() => setFailed(false)}
            >
              Volver a intentar
            </button>
          </div>
        ) : (
          <video
            ref={attachVideo}
            key={server.id}
            controls
            playsInline
            preload="metadata"
            poster={poster}
            src={server.source}
            onError={() => setFailed(true)}
            aria-label="Clip original Yoru de demostración, 12 segundos, sin audio"
          >
            Tu navegador no admite este vídeo de prueba.
          </video>
        )}
      </div>
      <div className="player-info">
        <span>
          <CircleCheck size={14} /> Clip original de prueba
        </span>
        <span>
          12 segundos · Sin audio · Todos los episodios usan este clip
        </span>
      </div>
      <div className="server-selector">
        <div className="server-heading">
          <MonitorPlay size={18} />
          <h2>Elige un servidor</h2>
          <span>Solo la fuente local está disponible</span>
        </div>
        <div
          className="server-options"
          role="group"
          aria-label="Servidores de vídeo"
        >
          {demoServers.map((item) => (
            <button
              key={item.id}
              disabled={!item.available}
              className={`server-option ${item.id === selected ? "selected" : ""}`}
              aria-pressed={item.id === selected}
              onClick={() => {
                setSelected(item.id);
                setFailed(false);
              }}
            >
              <span>
                {item.available ? (
                  <span className="live-dot" />
                ) : (
                  <LockKeyhole size={13} />
                )}{" "}
                {item.label}
              </span>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
