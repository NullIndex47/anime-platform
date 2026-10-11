import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile } from '../types/profile';
import { isUsernameAllowed, MODERATION_MESSAGE } from './username-moderation';
export const RESERVED_USERNAMES = [
  'admin', 'administrator', 'administrador', 'support', 'soporte',
  'yoru', 'moderator', 'moderador', 'mod', 'root', 'system',
  'sistema', 'staff', 'official', 'oficial', 'help', 'api', 'null',
] as const;
export function validateUsername(username: string): string | null {
  if (username.length < 3 || username.length > 20 || /[^A-Za-z0-9_]/.test(username)) return 'Usa de 3 a 20 caracteres: letras A–Z, números o guiones bajos, sin espacios.';
  if ((RESERVED_USERNAMES as readonly string[]).includes(username.toLowerCase())) return 'Este nombre está reservado. Elige otro nombre de usuario.';
  if (!isUsernameAllowed(username)) return MODERATION_MESSAGE;
  return null;
}
export function profileError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (code === '23505') return 'Este nombre de usuario ya está ocupado. Elige otro.';
  if (code === '23514') return 'El nombre es inválido, está reservado o no cumple las normas de YORU. Elige otro.';
  if (code === '42501') return 'No tienes permiso para guardar este perfil. Vuelve a iniciar sesión.';
  if (code === 'PGRST205' || code === '42P01') return 'Los perfiles todavía no están disponibles. Inténtalo más tarde.';
  return 'No se pudo conectar con Supabase o guardar el perfil. Inténtalo de nuevo.';
}
export async function loadProfile(client: SupabaseClient, userId: string): Promise<UserProfile | null> {
  const { data, error } = await client.from('profiles').select('id, username').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}
export async function saveProfile(client: SupabaseClient, userId: string, username: string, existing: boolean): Promise<UserProfile> {
  const invalid = validateUsername(username);
  if (invalid) throw new Error(invalid);
  // PostgreSQL UNIQUE decides availability atomically; a preflight read cannot reserve a name.
  const query = existing
    ? client.from('profiles').update({ username }).eq('id', userId)
    : client.from('profiles').insert({ id: userId, username });
  const { data, error } = await query.select('id, username').single();
  if (error) throw error;
  return data;
}
