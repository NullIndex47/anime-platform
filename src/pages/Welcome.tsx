import { Link, Navigate, useNavigate } from 'react-router';
import { useAuth } from '../auth/session';
import { DefaultAvatar, ProfileForm } from '../components/ProfileForm';
import { useProfile } from '../profiles/useProfile';
export default function Welcome() {
  const { session, loading: authLoading } = useAuth();
  const { profile, loading, error, retry } = useProfile();
  const navigate = useNavigate();
  if (authLoading || loading) return <div className="container page-space" role="status">Cargando tu perfil…</div>;
  if (!session) return <Navigate to="/iniciar-sesion" replace />;
  if (profile) return <Navigate to="/cuenta" replace />;
  return <div className="container page-space profile-page">
    <div className="page-heading"><span className="eyebrow">TU HISTORIA EMPIEZA AQUÍ</span><h1>Bienvenido a YORU<span className="accent">.</span></h1><p>Elige cómo quieres que te conozcan.</p></div>
    <section className="panel profile-panel">
      <DefaultAvatar />
      {error ? <><p role="alert">{error}</p><button className="button" onClick={retry}>Reintentar</button></>
        : <ProfileForm key={session.user.id} profile={null} onSaved={() => navigate('/cuenta', { replace: true })} />}
      <Link className="profile-catalog-link" to="/catalogo">Seguir explorando el catálogo</Link>
    </section>
  </div>;
}
