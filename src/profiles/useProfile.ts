import { useCallback, useEffect, useState } from 'react';
import { requireClient, useAuth } from '../auth/session';
import { loadProfile, profileError } from '../services/profiles';
import type { UserProfile } from '../types/profile';
export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ userId?: string; loading: boolean; profile: UserProfile | null; error: string | null }>({
    loading: true, profile: null, error: null,
  });
  useEffect(() => {
    let active = true;
    setState({ userId, loading: !!userId, profile: null, error: null });
    if (userId) {
      loadProfile(requireClient(), userId).then(
        profile => { if (active) setState({ userId, loading: false, profile, error: null }); },
        error => { if (active) setState({ userId, loading: false, profile: null, error: profileError(error) }); },
      );
    }
    return () => { active = false; };
  }, [userId, revision]);
  const onSaved = useCallback((profile: UserProfile) => {
    setState({ userId: profile.id, loading: false, profile, error: null });
  }, []);
  return {
    loading: !!userId && (state.userId !== userId || state.loading),
    profile: state.userId === userId ? state.profile : null,
    error: state.userId === userId ? state.error : null,
    retry: () => setRevision(value => value + 1), onSaved,
  };
}
