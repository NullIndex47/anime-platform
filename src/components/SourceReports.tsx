import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flag,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
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
const PAGE_SIZE = 8;
export default function SourceReports({ episodeId }: { episodeId: string }) {
  const [rows, setRows] = useState<Report[]>([]),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [busy, setBusy] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [filter, setFilter] = useState<"pending" | "reviewed">("pending"),
    [page, setPage] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    setRows([]);
    setPage(0);
    setFilter("pending");
  }, [episodeId]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const { data, error } = await requireClient().rpc(
          "yoru_source_reports",
          { p_episode_id: episodeId },
        );
        if (error) throw error;
        if (active)
          setRows((previous) => [
            ...(data || []),
            ...previous.filter(
              (r) =>
                r.resolved && !(data || []).some((n: Report) => n.id === r.id),
            ),
          ]);
      } catch {
        if (active) setError("No se pudieron cargar los reportes.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [episodeId, retry]);
  const pending = rows.filter((r) => !r.resolved),
    reviewed = rows.filter((r) => r.resolved),
    filtered = filter === "pending" ? pending : reviewed;
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1),
  );
  return (
    <section className="source-reports" aria-label="Reportes de servidores">
      <div className="source-reports-heading">
        <h4>
          <Flag size={18} aria-hidden="true" />
          Reportes de servidores{" "}
          <span className="section-count">{pending.length}</span>
        </h4>
        <button
          type="button"
          className="icon-control"
          aria-label="Actualizar reportes"
          title="Actualizar reportes"
          disabled={loading || !!busy}
          onClick={() => setRetry((v) => v + 1)}
        >
          <RefreshCw size={17} aria-hidden="true" />
        </button>
      </div>
      {rows.length > 0 && (
        <div
          className="report-filters"
          role="group"
          aria-label="Estado de los reportes"
        >
          <button
            type="button"
            aria-pressed={filter === "pending"}
            onClick={() => {
              setFilter("pending");
              setPage(0);
            }}
          >
            Pendientes <span>{pending.length}</span>
          </button>
          <button
            type="button"
            aria-pressed={filter === "reviewed"}
            onClick={() => {
              setFilter("reviewed");
              setPage(0);
            }}
          >
            Revisados ahora <span>{reviewed.length}</span>
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p className="reports-empty" role="status">
          <LoaderCircle className="is-spinning" size={20} aria-hidden="true" />
          Cargando reportes…
        </p>
      ) : !filtered.length ? (
        <div className="reports-empty">
          <CheckCircle2 size={24} aria-hidden="true" />
          <p>
            {filter === "pending"
              ? "No hay reportes pendientes."
              : "Los reportes que revises aparecerán aquí durante esta sesión."}
          </p>
        </div>
      ) : (
        <div className="report-rows">
          {filtered
            .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
            .map((r) => (
              <article className="report-row" key={r.id}>
                <div className="report-row-copy">
                  <strong>{r.server_name}</strong>
                  <p>{reasonLabels[r.reason] || "Otro problema"}</p>
                </div>
                <time dateTime={r.created_at}>
                  {new Date(r.created_at).toLocaleDateString("es", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </time>
                <span
                  className={`report-state ${r.resolved ? "is-reviewed" : ""}`}
                >
                  {r.resolved ? "Revisado" : "Pendiente"}
                </span>
                {!r.resolved && (
                  <button
                    type="button"
                    className="quiet-action review-action"
                    disabled={!!busy}
                    onClick={async () => {
                      if (lock.current) return;
                      lock.current = true;
                      setBusy(r.id);
                      setError("");
                      try {
                        const { error } = await requireClient().rpc(
                          "yoru_resolve_source_report",
                          { p_id: r.id },
                        );
                        if (error) throw error;
                        setRows((previous) =>
                          previous.map((row) =>
                            row.id === r.id ? { ...row, resolved: true } : row,
                          ),
                        );
                      } catch {
                        setError("No se pudo resolver el reporte.");
                      } finally {
                        lock.current = false;
                        setBusy(null);
                      }
                    }}
                  >
                    <Check size={16} aria-hidden="true" />
                    {busy === r.id ? "Guardando…" : "Marcar revisado"}
                  </button>
                )}
              </article>
            ))}
        </div>
      )}
      {filtered.length > PAGE_SIZE && (
        <nav className="report-pagination" aria-label="Páginas de reportes">
          <button
            type="button"
            className="icon-control"
            aria-label="Reportes anteriores"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={17} aria-hidden="true" />
          </button>
          <span>
            Página {currentPage + 1} de {Math.ceil(filtered.length / PAGE_SIZE)}
          </span>
          <button
            type="button"
            className="icon-control"
            aria-label="Reportes siguientes"
            disabled={(currentPage + 1) * PAGE_SIZE >= filtered.length}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </nav>
      )}
      {pending.length >= 100 && (
        <p className="reports-limit">
          Se muestran los 100 pendientes más recientes. Actualiza tras
          revisarlos para cargar los siguientes.
        </p>
      )}
    </section>
  );
}
