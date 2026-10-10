import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { DemoNotice } from "../components/DemoNotice";
import { Logo } from "../components/Layout";
export default function Auth({ mode }: { mode: "login" | "register" }) {
  const register = mode === "register";
  const [show, setShow] = useState(false);
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
          {register ? "Empieza tu historia" : "Qué bueno verte"}
          <span className="accent">.</span>
        </h1>
        <p>
          {register
            ? "Tu próximo lugar favorito está por llegar."
            : "Un universo de historias te espera al otro lado."}
        </p>
        <DemoNotice>
          Vista previa del formulario. El registro y el inicio de sesión aún no
          están conectados. No se envían ni guardan datos.
        </DemoNotice>
        <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
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
          <label htmlFor="email">
            Correo electrónico
            <input
              id="email"
              name="email"
              type="email"
              placeholder="tu@correo.com"
              autoComplete="email"
            />
          </label>
          <label htmlFor="password">
            Contraseña
            <div className="password-field">
              <input
                id="password"
                name="password"
                type={show ? "text" : "password"}
                placeholder={
                  register ? "Al menos 8 caracteres" : "Tu contraseña"
                }
                autoComplete={register ? "new-password" : "current-password"}
                minLength={8}
              />
              <button
                type="button"
                aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {!register && (
            <span className="auth-pending">
              Recuperación de contraseña · próximamente
            </span>
          )}
          <button className="button" type="submit" disabled>
            <LockKeyhole size={16} />
            {register ? "Crear cuenta" : "Iniciar sesión"} · próximamente
          </button>
        </form>
        <div className="auth-switch">
          {register ? "¿Ya tienes una cuenta?" : "¿Primera vez por aquí?"}{" "}
          <Link to={register ? "/iniciar-sesion" : "/registro"}>
            {register ? "Iniciar sesión" : "Descubre el registro"}{" "}
            <ArrowRight size={14} />
          </Link>
        </div>
        <p className="auth-footnote">
          Tu cuenta, tus favoritos y tu comunidad llegarán en la siguiente fase.
        </p>
      </section>
    </div>
  );
}
