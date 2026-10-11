import { Link, Navigate } from 'react-router';
import { useAuth } from '../auth/session';
export default function AuthCallback() {
  const { loading, error, callbackTarget } = useAuth();
  if (loading) return <div className="container page-space" role="status">Completando autenticación…</div>;
  if (error || !callbackTarget) return <div className="container page-space"><h1>No se pudo completar el acceso</h1><p role="alert">{error || 'Solicita un enlace nuevo para continuar.'}</p><Link to="/iniciar-sesion">Iniciar sesión</Link> · <Link to="/recuperar-contrasena">Recuperar contraseña</Link></div>;
  return <Navigate to={callbackTarget} replace />;
}
