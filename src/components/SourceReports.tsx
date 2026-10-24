import { useEffect, useState } from "react";
import { requireClient } from "../auth/session";
const reasonLabels: Record<string, string> = {
  no_playback: "El vídeo no se reproduce",
  wrong_video: "Vídeo incorrecto",
  other: "Otro problema",
};
interface Report {
  id: string;
  server_name: string;
  reason: string;
  created_at: string;
  resolved: boolean;
}
export default function SourceReports({ episodeId }: { episodeId: string }) {
  const [rows, setRows] = useState<Report[]>([]),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    requireClient()
      .rpc("yoru_source_reports", { p_episode_id: episodeId })
      .then(({ data, error }) => {
        if (!active) return;
        setError(error ? "No se pudieron cargar los reportes." : "");
        setRows(data || []);
      });
    return () => {
      active = false;
    };
  }, [episodeId, retry]);
  return (
    <section aria-label="Reportes de servidores">
      <h4>Reportes de servidores</h4>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="button button-outline"
        onClick={() => setRetry((v) => v + 1)}
      >
        Actualizar reportes
      </button>
      {!rows.length && !error && <p>No hay reportes pendientes.</p>}
      {rows.map((r) => (
        <article className="panel" key={r.id}>
          <strong>{r.server_name}</strong>
          <p>
            {reasonLabels[r.reason] || "Otro problema"} ·{" "}
            {new Date(r.created_at).toLocaleDateString("es")}
          </p>
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const { error } = await requireClient().rpc(
                  "yoru_resolve_source_report",
                  { p_id: r.id },
                );
                if (error) throw error;
                setRetry((v) => v + 1);
              } catch {
                setError("No se pudo resolver el reporte.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Marcar revisado
          </button>
        </article>
      ))}
    </section>
  );
}
