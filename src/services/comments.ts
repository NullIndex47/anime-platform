import { demoComments } from "../data/anime";
// Read-only fixture service; deliberately does not submit or persist comments.
export const commentService = {
  list: (animeId: string, episodeNumber?: number) =>
    demoComments.map((comment) => ({
      ...comment,
      id: `${animeId}-${episodeNumber ?? "anime"}-${comment.id}`,
      body: episodeNumber
        ? comment.body
        : comment.id === "c2"
          ? "El mundo de esta historia tiene muchos detalles por descubrir. Una propuesta que merece una oportunidad."
          : comment.body,
      spoiler: episodeNumber ? comment.spoiler : false,
    })),
};
