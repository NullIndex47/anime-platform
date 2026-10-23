import { useEffect, useRef, useState } from "react";
import type { ImgHTMLAttributes } from "react";
import { requireClient } from "../auth/session";
import { COVER_BUCKET } from "../services/covers";
const placeholder = "/artwork/catalog-placeholder.svg";
export default function CoverImage({
  path,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { path?: string | null }) {
  const element = useRef<HTMLImageElement>(null);
  const retries = useRef(0);
  const [nearViewport, setNearViewport] = useState(props.loading !== "lazy");
  const [retry, setRetry] = useState(0);
  const [image, setImage] = useState({ path: "", url: "" });
  useEffect(() => {
    retries.current = 0;
  }, [path]);
  useEffect(() => {
    if (
      props.loading !== "lazy" ||
      !element.current ||
      !window.IntersectionObserver
    ) {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [props.loading]);
  useEffect(() => {
    let active = true;
    if (path && nearViewport) {
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
  }, [path, nearViewport, retry]);
  return (
    <img
      {...props}
      ref={element}
      src={path && image.path === path ? image.url : placeholder}
      onError={(event) => {
        if (event.currentTarget.getAttribute("src") === placeholder) return;
        // A deferred/background/offline fetch can outlive its short-lived signature.
        // Re-sign once, then fall back without an infinite request loop.
        setImage({ path: "", url: "" });
        if (retries.current++ === 0) setRetry((value) => value + 1);
      }}
    />
  );
}
