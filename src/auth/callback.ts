import type { SupabaseClient } from '@supabase/supabase-js';

const origins = new Set([
  'https://anime-platform.cuentagaming1304.workers.dev',
  'http://localhost:5173',
  'https://feat-yoru-phase-2a-supabase-auth-anime-platform.cuentagaming1304.workers.dev',
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
  const type = query.get('type') || hash.get('type');
  let recovery = type === 'recovery';
  const code = query.get('code');
  const tokenHash = query.get('token_hash');
  if (code) {
    // Supabase emits PASSWORD_RECOVERY for PKCE recovery links.
    const { data: listener } = client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') recovery = true;
    });
    try {
      const { error } = await client.auth.exchangeCodeForSession(code, query.has('sb_flow_id') ? { flowId: query.get('sb_flow_id')! } : undefined);
      if (error) throw error;
    } finally { listener.subscription.unsubscribe(); }
  } else if (tokenHash && (type === 'email' || type === 'signup' || type === 'recovery')) {
    const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) throw error;
  } else if (hash.get('access_token') && hash.get('refresh_token')) {
    const { error } = await client.auth.setSession({
      access_token: hash.get('access_token')!, refresh_token: hash.get('refresh_token')!,
    });
    if (error) throw error;
  } else {
    throw new Error('Falta el código de autenticación. Solicita un enlace nuevo.');
  }
  return recovery ? '/actualizar-contrasena' : '/cuenta';
}
