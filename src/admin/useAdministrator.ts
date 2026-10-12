import { useEffect, useState } from "react";
import { useAuth } from "../auth/session";
import { isAdministrator } from "../services/catalog-admin";

// This controls navigation only. PostgreSQL/Worker authorization still protects
// the page and every operation. Never persist a role or derive it from metadata.
export function useAdministrator() {
  const { session, loading } = useAuth();
  const identity =
    !loading && session ? `${session.user.id}:${session.access_token}` : null;
  const [confirmation, setConfirmation] = useState<{
    identity: string | null;
    allowed: boolean;
  }>({ identity: null, allowed: false });
  if (confirmation.identity !== identity)
    setConfirmation({ identity, allowed: false });
  useEffect(() => {
    if (!identity) return;
    let active = true;
    const controller = new AbortController();
    isAdministrator(controller.signal)
      .then((allowed) => {
        if (active) setConfirmation({ identity, allowed });
      })
      .catch(() => {
        if (active) setConfirmation({ identity, allowed: false });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [identity]);
  // A changed identity hides the old result during render, before effects run.
  return (
    identity !== null &&
    confirmation.identity === identity &&
    confirmation.allowed
  );
}
