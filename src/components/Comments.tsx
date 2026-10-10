import { useState } from "react";
import { MessageCircle, LockKeyhole, Eye, EyeOff } from "lucide-react";
import { commentService } from "../services/comments";
import { formatDate } from "../services/catalog";
export function Comments({
  animeId,
  episodeNumber,
}: {
  animeId: string;
  episodeNumber?: number;
}) {
  const comments = commentService.list(animeId, episodeNumber);
  const [revealed, setRevealed] = useState<string[]>([]);
  return (
    <section className="comments panel" aria-labelledby="comments-title">
      <div className="comments-heading">
        <h2 id="comments-title">
          <MessageCircle size={21} /> La conversación{" "}
          <span className="count-badge">{comments.length}</span>
        </h2>
        <span className="muted text-xs">Comentarios de demostración</span>
      </div>
      <div className="comment-compose">
        <label htmlFor="comment-draft">Tu punto de vista también cuenta</label>
        <textarea
          id="comment-draft"
          placeholder="La publicación de comentarios estará disponible en una próxima fase."
          disabled
          rows={3}
        />
        <div>
          <span>
            <LockKeyhole size={14} /> Publicación pendiente de integración
          </span>
          <button className="button button-small" disabled>
            Publicar comentario
          </button>
        </div>
      </div>
      <div className="comment-list">
        {comments.map((comment) => (
          <article className="comment" key={comment.id}>
            <span
              className="avatar"
              style={{ color: comment.color, background: `${comment.color}18` }}
            >
              {comment.initials}
            </span>
            <div className="comment-content">
              <div className="comment-byline">
                <strong>{comment.author}</strong>
                <span>{formatDate(comment.date)}</span>
                <span className="comment-demo">demo</span>
              </div>
              {comment.spoiler ? (
                <>
                  <button
                    className="spoiler-toggle"
                    onClick={() =>
                      setRevealed((items) =>
                        items.includes(comment.id)
                          ? items.filter((id) => id !== comment.id)
                          : [...items, comment.id],
                      )
                    }
                  >
                    {revealed.includes(comment.id) ? (
                      <EyeOff size={15} />
                    ) : (
                      <Eye size={15} />
                    )}
                    {revealed.includes(comment.id)
                      ? "Ocultar spoiler"
                      : "Este comentario contiene spoilers · Mostrar"}
                  </button>
                  {revealed.includes(comment.id) && <p>{comment.body}</p>}
                </>
              ) : (
                <p>{comment.body}</p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
