import { useState, type FormEvent } from 'react';
import { UserRound } from 'lucide-react';
import { requireClient, useAuth } from '../auth/session';
import { profileError, saveProfile, validateUsername } from '../services/profiles';
import type { UserProfile } from '../types/profile';
export function DefaultAvatar() {
  return <span className="profile-avatar" role="img" aria-label="Imagen de perfil predeterminada"><UserRound size={38} aria-hidden="true" /></span>;
}
export function ProfileForm({ profile, onSaved }: { profile: UserProfile | null; onSaved: (profile: UserProfile) => void }) {
  const { session } = useAuth();
  const [username, setUsername] = useState(profile?.username || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !session) return;
    setError(null); setSuccess(false);
    const invalid = validateUsername(username);
    if (invalid) { setError(invalid); return; }
    setBusy(true);
    try {
      const saved = await saveProfile(requireClient(), session.user.id, username, !!profile);
      onSaved(saved); setSuccess(true);
    } catch (error) { setError(profileError(error)); }
    finally { setBusy(false); }
  }
  return <form className="profile-form" onSubmit={submit} noValidate>
    <label htmlFor="username">Nombre de usuario público</label>
    <input id="username" name="username" value={username} autoComplete="username" autoCapitalize="none" spellCheck={false}
      minLength={3} maxLength={20} aria-describedby={error ? 'username-help username-error' : 'username-help'} aria-invalid={!!error} disabled={busy}
      onChange={event => { const value = event.target.value; setUsername(value); setError(value ? validateUsername(value) : null); setSuccess(false); }} />
    <p id="username-help">De 3 a 20 caracteres: letras A–Z, números y guiones bajos. Las mayúsculas no distinguen nombres. Es independiente de tu cuenta de Google.</p>
    {error && <p id="username-error" className="auth-feedback" role="alert">{error}</p>}
    {success && <p role="status">Nombre actualizado y guardado en Supabase.</p>}
    <button className="button" disabled={busy} aria-busy={busy}>{busy ? 'Guardando…' : profile ? 'Guardar nombre' : 'Crear mi perfil'}</button>
  </form>;
}
