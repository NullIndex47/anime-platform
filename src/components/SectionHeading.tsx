import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
export function SectionHeading({
  eyebrow,
  title,
  to,
  action,
}: {
  eyebrow: string;
  title: string;
  to?: string;
  action?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>
          {title}
          <span className="accent">.</span>
        </h2>
      </div>
      {to && (
        <Link className="text-link" to={to}>
          {action ?? "Ver todos"}
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
