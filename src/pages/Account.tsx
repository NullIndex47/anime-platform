import { useState } from 'react';
import { Navigate } from 'react-router';
import { authError } from '../auth/callback';
import { requireClient, setAuthError, useAuth } from '../auth/session';
export default function Account() {
  const { session, loading, error: sessionError } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (loading) return <div className="container page-space" role="status">Comprobando sesión…</div>;
  if (!session) return <Navigate to="/iniciar-sesion" replace />;
  async function signOut() {
    if (busy) return;
    setBusy(true); setError(null); setAuthError(null);
    try {
      const { error } = await requireClient().auth.signOut();
      if (error) throw error;
    } catch (error) { setError(authError(error)); setAuthError(authError(error)); }
    finally { setBusy(false); }
  }
  return <div className="container page-space">
    <div className="page-heading"><span className="eyebrow">TU ESPACIO EN YORU</span><h1>Mi cuenta<span className="accent">.</span></h1></div>
    <section className="panel account-panel">
      <p>Sesión iniciada como <strong>{session.user.email}</strong></p>
      <p>Correo: {session.user.email_confirmed_at ? 'confirmado' : 'pendiente de confirmación'}</p>
      {(error || sessionError) && <p role="alert">{error || sessionError}</p>}
      <button className="button" disabled={busy} onClick={signOut}>{busy ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
    </section>
  </div>;
}
