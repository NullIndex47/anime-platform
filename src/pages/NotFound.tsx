import { Link } from "react-router";
import { ArrowLeft, Moon } from "lucide-react";
export default function NotFound() {
  return (
    <div className="container empty-state not-found">
      <Moon size={48} />
      <span className="eyebrow">404 · FUERA DEL MAPA</span>
      <h1>Esta historia aún no existe.</h1>
      <p>La página, el anime o el episodio que buscas no está disponible.</p>
      <Link className="button" to="/catalogo">
        <ArrowLeft size={16} /> Volver al catálogo
      </Link>
    </div>
  );
}
