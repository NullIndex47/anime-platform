import { useEffect, useState } from "react";
import type { ImgHTMLAttributes } from "react";
import { requireClient } from "../auth/session";
import { COVER_BUCKET } from "../services/covers";
const placeholder = "/artwork/catalog-placeholder.svg";
export default function CoverImage({
  path,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { path?: string | null }) {
  const [image, setImage] = useState({ path: "", url: "" });
  useEffect(() => {
    let active = true;
    if (path) {
      Promise.resolve()
        .then(() =>
          requireClient().storage.from(COVER_BUCKET).createSignedUrl(path, 60),
        )
        .then(({ data }) => {
          if (active && data?.signedUrl)
            setImage({ path, url: data.signedUrl });
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [path]);
  return (
    <img
      {...props}
      src={path && image.path === path ? image.url : placeholder}
      onError={(e) => {
        if (e.currentTarget.getAttribute("src") !== placeholder)
          e.currentTarget.src = placeholder;
      }}
    />
  );
}
