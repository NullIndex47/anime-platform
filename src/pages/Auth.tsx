import { useState } from "react";
import { Compass, Sparkles, ShieldCheck, ArrowRight } from "lucide-react";
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
    <div className="container auth-page auth-access-page">
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
            Cada viaje{" "}
            <br />
            empieza con{" "}
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
      <section className="auth-form-section" aria-labelledby="auth-title">
        <span className="eyebrow">BIENVENIDO A YORU</span>
        <h1 id="auth-title">Tu próxima historia<br />empieza aquí<span className="accent">.</span></h1>
        <p className="auth-subtitle">Un universo de historias. Un lugar al que volver.</p>
        <ul className="auth-benefits">
          <li><Compass aria-hidden="true" size={20} /><span>Descubre mundos que te sorprenden.</span></li>
          <li><Sparkles aria-hidden="true" size={20} /><span>Encuentra tu próxima historia favorita.</span></li>
          <li><ShieldCheck aria-hidden="true" size={20} /><span>Accede con Google, sin otra contraseña.</span></li>
        </ul>
        {(error || sessionError || configurationError) && <p className="auth-feedback" role="alert">{error || sessionError || configurationError}</p>}
        <button className="button auth-google-button" type="button" aria-describedby="auth-account-note" aria-busy={busy} disabled={busy || !!configurationError} onClick={google}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" className="google-mark">
            <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z" />
            <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z" />
            <path fill="#FBBC05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.34-2.59Z" />
            <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59c.79-2.36 3-4.12 5.6-4.12Z" />
          </svg>
          {busy ? 'Conectando con Google…' : 'Continuar con Google'}
          <ArrowRight aria-hidden="true" size={18} />
        </button>
        <p className="auth-footnote" id="auth-account-note">¿Primera vez? Al continuar con Google se crea tu cuenta automáticamente.</p>
      </section>
    </div>
  );
}
