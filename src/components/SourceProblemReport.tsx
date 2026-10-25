import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, Flag, LoaderCircle, Send, X } from "lucide-react";
import { requireClient, useAuth } from "../auth/session";
import { reportSource, ReportSubmissionError } from "../services/playback";

export default function SourceProblemReport({
  sourceId,
  serverName,
  close,
}: {
  sourceId: string;
  serverName: string;
  close: () => void;
}) {
  const { session, loading } = useAuth();
  return (
    <ReportPanel
      key={`${sourceId}:${session?.user.id || "guest"}`}
      sourceId={sourceId}
      serverName={serverName}
      close={close}
      sessionUser={session?.user.id || null}
      sessionToken={session?.access_token || null}
      loading={loading}
    />
  );
}
function ReportPanel({
  sourceId,
  serverName,
  close,
  sessionUser,
  sessionToken,
  loading,
}: {
  sourceId: string;
  serverName: string;
  close: () => void;
  sessionUser: string | null;
  sessionToken: string | null;
  loading: boolean;
}) {
  const [reason, setReason] = useState("no_playback"),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState(""),
    [expired, setExpired] = useState(false);
  const lock = useRef(false),
    alive = useRef(true),
    closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    alive.current = true;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setExpired(false);
    setError("");
  }, [sessionToken]);
  return (
    <section
      className="report-form"
      aria-label="Reportar problema del servidor"
    >
      <div className="report-heading">
        <div>
          <span className="section-kicker">
            <Flag size={14} aria-hidden="true" /> Reportar problema
          </span>
          <h3>{serverName}</h3>
        </div>
        <button
          ref={closeRef}
          className="icon-control"
          type="button"
          aria-label="Cerrar reporte"
          onClick={close}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {loading ? (
        <p className="report-feedback" role="status">
          <LoaderCircle size={17} aria-hidden="true" className="is-spinning" />{" "}
          Comprobando sesión…
        </p>
      ) : !sessionUser || expired ? (
        <div className="report-signin">
          <p role={expired ? "alert" : undefined}>
            {expired
              ? error ||
                "Tu sesión ha caducado. Vuelve a iniciar sesión para reportar."
              : "Inicia sesión con Google para enviar un reporte."}
          </p>
          <Link className="text-link" to="/iniciar-sesion">
            Acceder con Google →
          </Link>
        </div>
      ) : sent ? (
        <p role="status" className="report-feedback report-sent">
          <CheckCircle2 size={20} aria-hidden="true" /> Reporte enviado. Gracias
          por avisar.
        </p>
      ) : (
        <form
          className="report-controls"
          onSubmit={async (e) => {
            e.preventDefault();
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError("");
            try {
              const { data, error } = await requireClient().auth.getSession();
              if (!alive.current) return;
              if (
                error ||
                !data.session ||
                data.session.user.id !== sessionUser
              )
                throw new ReportSubmissionError(
                  "session",
                  "Tu sesión ha caducado. Vuelve a iniciar sesión para reportar.",
                );
              await reportSource(sourceId, reason);
              if (alive.current) setSent(true);
            } catch (e) {
              if (!alive.current) return;
              setError(
                e instanceof Error
                  ? e.message
                  : "No se pudo enviar el reporte. Inténtalo de nuevo.",
              );
              if (e instanceof ReportSubmissionError && e.reason === "session")
                setExpired(true);
            } finally {
              lock.current = false;
              if (alive.current) setBusy(false);
            }
          }}
        >
          <label>
            Problema con {serverName}
            <select
              disabled={busy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="no_playback">El vídeo no se reproduce</option>
              <option value="wrong_video">Vídeo incorrecto</option>
              <option value="other">Otro problema</option>
            </select>
          </label>
          <button className="button" disabled={busy}>
            <Send size={16} aria-hidden="true" />
            {busy ? "Enviando…" : "Enviar reporte"}
          </button>
          {error && (
            <p className="report-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
