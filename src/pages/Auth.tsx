import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { authError, callbackUrl } from "../auth/callback";
import { configurationError, requireClient, setAuthError, useAuth } from "../auth/session";
import { Logo } from "../components/Layout";
export default function Auth({ mode }: { mode: "login" | "register" | "recover" | "reset" }) {
  const register = mode === "register";
  const [show, setShow] = useState(false);
  const { session, loading, error: sessionError } = useAuth();
  const navigate = useNavigate();
  const recover = mode === "recover";
  const reset = mode === "reset";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = String(values.get('email') || '').trim();
    const password = String(values.get('password') || '');
    setBusy(true); setError(null); setAuthError(null); setMessage(null);
    try {
      const client = requireClient();
      if (reset) {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        form.reset(); setSent(true); setMessage('Contraseña actualizada. Ya puedes acceder con tu nueva contraseña.');
      } else if (recover) {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl(window.location.origin) });
        if (error) throw error;
        setMessage('Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña.');
      } else if (register) {
        const { data, error } = await client.auth.signUp({ email, password, options: {
          emailRedirectTo: callbackUrl(window.location.origin), data: { display_name: String(values.get('name') || '').trim() },
        } });
        if (error) throw error;
        form.reset();
        if (data.session) navigate('/cuenta', { replace: true });
        else setMessage('Revisa tu correo y sigue el enlace de confirmación antes de iniciar sesión.');
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        form.reset(); navigate('/cuenta', { replace: true });
      }
    } catch (error) { setError(authError(error)); }
    finally { setBusy(false); }
  }
  async function google() {
    if (busy) return;
    setBusy(true); setError(null); setAuthError(null);
    try {
      const { error } = await requireClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl(window.location.origin) } });
      if (error) throw error;
    } catch (error) { setError(authError(error)); setBusy(false); }
  }
  if (loading) return <div className="container page-space" role="status">Comprobando sesión…</div>;
  if (session && !reset && !recover) return <Navigate to="/cuenta" replace />;
  if (reset && !session) return <div className="container page-space"><h1>Solicita un enlace nuevo</h1><Link to="/recuperar-contrasena">Recuperar contraseña</Link></div>;
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
        <h1>
          {reset ? "Nueva contraseña" : recover ? "Recupera tu acceso" : register ? "Empieza tu historia" : "Qué bueno verte"}
          <span className="accent">.</span>
        </h1>
        <p>
          {register
            ? "Tu próximo lugar favorito está por llegar."
            : "Un universo de historias te espera al otro lado."}
        </p>
        {(error || sessionError || configurationError) && <p className="auth-feedback" role="alert">{error || sessionError || configurationError}</p>}
        {message && <p className="auth-feedback" role="status">{message}</p>}
        {!recover && !reset && <button className="button button-outline" type="button" disabled={busy || !!configurationError} onClick={google}>Continuar con Google</button>}
        <form className="auth-form" onSubmit={submit}>
          <fieldset disabled={busy || !!configurationError || sent}>
          {register && (
            <label htmlFor="name">
              Tu nombre
              <input
                id="name"
                name="name"
                type="text"
                placeholder="¿Cómo te llamamos?"
                autoComplete="name"
              />
            </label>
          )}
          {!reset && <label htmlFor="email">
            Correo electrónico
            <input
              id="email"
              name="email"
              type="email"
              placeholder="tu@correo.com"
              required
              autoComplete="email"
            />
          </label>}
          {!recover && <label htmlFor="password">
            Contraseña
            <div className="password-field">
              <input
                id="password"
                name="password"
                type={show ? "text" : "password"}
                placeholder={
                  register ? "Al menos 8 caracteres" : "Tu contraseña"
                }
                required
                autoComplete={register || reset ? "new-password" : "current-password"}
                minLength={register || reset ? 8 : undefined}
              />
              <button
                type="button"
                aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>}
          {!register && !recover && !reset && <Link className="text-link" to="/recuperar-contrasena">¿Olvidaste tu contraseña?</Link>}
          <button className="button" type="submit" disabled={busy || !!configurationError || sent}>
            <LockKeyhole size={16} />
            {busy ? "Procesando…" : reset ? "Guardar contraseña" : recover ? "Enviar enlace" : register ? "Crear cuenta" : "Iniciar sesión"}
          </button>
          </fieldset>
        </form>
        <div className="auth-switch">
          {register ? "¿Ya tienes una cuenta?" : "¿Primera vez por aquí?"}{" "}
          <Link to={register ? "/iniciar-sesion" : "/registro"}>
            {register ? "Iniciar sesión" : "Descubre el registro"}{" "}
            <ArrowRight size={14} />
          </Link>
        </div>
        <p className="auth-footnote">
          {reset && sent ? <Link to="/cuenta">Volver a mi cuenta</Link> : "Tu acceso a YORU, en un solo lugar."}
        </p>
      </section>
    </div>
  );
}
