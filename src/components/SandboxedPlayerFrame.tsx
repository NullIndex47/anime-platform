import { playbackIframePolicy, safePlaybackUrl } from "../services/playback";

/** Shared public/private boundary. Policy comes from code, never source data. */
export default function SandboxedPlayerFrame({
  url,
  title,
  onLoad,
  onError,
}: {
  url: string;
  title: string;
  onLoad?: () => void;
  onError?: () => void;
}) {
  const policy = playbackIframePolicy(url);
  // Fail closed: an unknown provider or missing policy must never render an
  // unsandboxed iframe. No spread of provider/admin supplied HTML attributes.
  if (!policy || !safePlaybackUrl("iframe", url)) return null;
  return (
    <iframe
      src={url}
      title={title}
      sandbox={policy.sandbox}
      allow={policy.allow}
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={onLoad}
      onError={onError}
    />
  );
}
