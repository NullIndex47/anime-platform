import type { SupabaseClient } from '@supabase/supabase-js';

const origins = new Set([
  'https://feat-yoru-phase-3d-real-catalog-anime-platform.cuentagaming1304.workers.dev',
  'https://feat-yoru-public-catalog-anime-platform.cuentagaming1304.workers.dev',
  'https://feat-yoru-admin-ux-improvements-anime-platform.cuentagaming1304.workers.dev',
  'https://feat-yoru-phase-3b-episode-management-anime-platform.cuentagaming1304.workers.dev',
  'https://anime-platform.cuentagaming1304.workers.dev',
  'http://localhost:5173',
  'https://feat-yoru-phase-3a-anime-catalog-anime-platform.cuentagaming1304.workers.dev',
  'https://feat-yoru-phase-2a-supabase-auth-anime-platform.cuentagaming1304.workers.dev',
  'https://feat-yoru-phase-2b-profiles-anime-platform.cuentagaming1304.workers.dev',
]);
export function callbackUrl(origin: string): string {
  if (!origins.has(origin)) throw new Error('Este dominio no está autorizado para autenticación.');
  return `${origin}/auth/callback`;
}
export function authError(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la autenticación. Inténtalo de nuevo.';
}
export async function processCallback(client: SupabaseClient, url: URL) {
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.slice(1));
  if (query.has('error') || hash.has('error')) {
    throw new Error(query.get('error_description') || hash.get('error_description') || 'El enlace de autenticación no es válido.');
  }
  const code = query.get('code');
  if (!code || query.has('token_hash') || hash.has('access_token') || query.get('type') === 'recovery') {
    throw new Error('Este enlace no permite acceder. Vuelve a iniciar sesión con Google.');
  }
  const { error } = await client.auth.exchangeCodeForSession(
    code, query.has('sb_flow_id') ? { flowId: query.get('sb_flow_id')! } : undefined,
  );
  if (error) throw error;
  return '/cuenta';
}
