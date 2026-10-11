import { useState } from "react";
import { Navigate } from "react-router";
import { authError, callbackUrl } from "../auth/callback";
import { configurationError, requireClient, setAuthError, useAuth } from "../auth/session";
import { Logo } from "../components/Layout";
export default function Auth() {
  const { session, loading, error: sessionError } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function google() {
    if (busy) return;
    setBusy(true); setError(null); setAuthError(null);
    try {
      const { error } = await requireClient().auth.signInWithOAuth({
        provider: 'google', options: { redirectTo: callbackUrl(window.location.origin) },
      });
      if (error) throw error;
    } catch (error) { setError(authError(error)); setBusy(false); }
  }
  if (loading) return <div className="container page-space" role="status">Comprobando sesión…</div>;
  if (session) return <Navigate to="/cuenta" replace />;
  return (
    <div className="container auth-page">
      <section className="auth-visual">
        <img
          src="/artwork/aoi.svg"
          alt="Paisaje original de un valle entre montañas"
        />
        <div className="auth-visual-shade" />
        <div>
          <Logo />
          <span className="eyebrow">UN LUGAR PARA TUS HISTORIAS</span>
          <h2>
            Cada viaje
            <br />
            empieza con
            <br />
            <em>un encuentro.</em>
          </h2>
          <p>
            Descubre mundos nuevos.
            <br />
            Encuentra historias que te acompañan.
          </p>
        </div>
      </section>
      <section className="auth-form-section">
        <span className="eyebrow">BIENVENIDO A YORU</span>
        <h1>Tu historia empieza aquí<span className="accent">.</span></h1>
        <p>Accede con Google. Si es tu primera visita, crearemos tu cuenta automáticamente.</p>
        {(error || sessionError || configurationError) && <p className="auth-feedback" role="alert">{error || sessionError || configurationError}</p>}
        <button className="button button-outline" type="button" disabled={busy || !!configurationError} onClick={google}>
          {busy ? 'Conectando con Google…' : 'Continuar con Google'}
        </button>
        <p className="auth-footnote">Tu acceso a YORU, en un solo lugar.</p>
      </section>
    </div>
  );
}
