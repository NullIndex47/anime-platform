import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { DefaultAvatar, ProfileForm } from '../components/ProfileForm';
import { useProfile } from '../profiles/useProfile';
import { authError } from '../auth/callback';
import { requireClient, setAuthError, useAuth } from '../auth/session';
export default function Account() {
  const { session, loading, error: sessionError } = useAuth();
  const { profile, loading: profileLoading, error: profileLoadError, retry, onSaved } = useProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (loading) return <div className="container page-space" role="status">Comprobando sesión…</div>;
  if (!session) return <Navigate to="/iniciar-sesion" replace />;
  if (profileLoading) return <div className="container page-space" role="status">Cargando tu perfil…</div>;
  if (!profileLoadError && !profile) return <Navigate to="/bienvenida" replace />;
  async function signOut() {
    if (busy) return;
    setBusy(true); setError(null); setAuthError(null);
    try {
      const { error } = await requireClient().auth.signOut();
      if (error) throw error;
    } catch (error) { setError(authError(error)); setAuthError(authError(error)); }
    finally { setBusy(false); }
  }
  return <div className="container page-space profile-page">
    <div className="page-heading"><span className="eyebrow">TU ESPACIO EN YORU</span><h1>Mi perfil<span className="accent">.</span></h1></div>
    <section className="panel profile-panel">
      <DefaultAvatar />
      {profileLoadError ? <><p role="alert">{profileLoadError}</p><button className="button" onClick={retry}>Reintentar</button></>
        : profile && <><h2>@{profile.username}</h2><ProfileForm key={session.user.id} profile={profile} onSaved={onSaved} /></>}
      <Link className="profile-catalog-link" to="/catalogo">Explorar el catálogo</Link>
      {(error || sessionError) && <p role="alert">{error || sessionError}</p>}
      <button className="button button-outline profile-signout" disabled={busy} onClick={signOut}>{busy ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
    </section>
  </div>;
}
