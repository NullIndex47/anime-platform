import rules from '../data/username-moderation.json';

export const MODERATION_MESSAGE = 'Este nombre no cumple las normas de YORU. Elige otro nombre de usuario.';

/** Only full candidates are matched. Repetition may expand a canonical run,
 * never shorten it: "Niger" and "fagot" must not turn into unrelated slurs. */
export function repetitionPattern(term: string): string {
  return [...term.matchAll(/(.)\1*/g)].map(([run]) => (run[0] === 'i' || run[0] === 'l' ? '[' + run[0] + '1]' : run[0]) + (run.length === 1 ? '+' : '{' + run.length + ',}')).join('');
}
export const moderationPatterns = Object.values(rules.groups).flat().map(term => new RegExp('^' + repetitionPattern(term) + '$'));
const exactPatterns = rules.exactReserved.map(term => new RegExp('^' + repetitionPattern(term) + '$'));

export function moderationCandidates(username: string): string[] {
  const raw = username.toLowerCase();
  // Keep runs of one-letter pieces together: f_u_c_k_user becomes fuck/user,
  // while a_s_s_a_s_s_i_n stays assassin instead of matching its fragments.
  const chunks: string[] = [];
  let letters = '';
  for (const piece of raw.split('_').filter(Boolean)) {
    if (piece.length === 1) letters += piece;
    else {
      if (letters) { chunks.push(letters); letters = ''; }
      chunks.push(piece);
    }
  }
  if (letters) chunks.push(letters);
  const tokens: string[] = [];
  for (let start = 0; start < chunks.length; start++) {
    for (let end = start + 1; end <= chunks.length; end++) tokens.push(chunks.slice(start, end).join(''));
  }
  const candidates = new Set<string>();
  for (const token of tokens) {
    for (const unpadded of [token, token.replace(/^[0-9]+|[0-9]+$/g, '')]) {
      for (const target of rules.leetTargets) {
        const normalized = unpadded.replace(/[0-9]/g, digit => target[rules.leetSources.indexOf(digit)]);
        candidates.add(normalized);
        for (const padding of rules.padding) {
          if (normalized.startsWith(padding)) candidates.add(normalized.slice(padding.length));
          if (normalized.endsWith(padding)) candidates.add(normalized.slice(0, -padding.length));
          if (normalized.startsWith(padding) && normalized.endsWith(padding) && normalized.length > padding.length * 2) {
            candidates.add(normalized.slice(padding.length, -padding.length));
          }
        }
      }
    }
  }
  return [...candidates];
}

export function isUsernameAllowed(username: string): boolean {
  if (username.length < 3 || username.length > 20 || /[^A-Za-z0-9_]/.test(username)) return false;
  if (moderationCandidates(username.replaceAll('_', '')).some(candidate => exactPatterns.some(pattern => pattern.test(candidate)))) return false;
  return !moderationCandidates(username).some(candidate => moderationPatterns.some(pattern => pattern.test(candidate)));
}
