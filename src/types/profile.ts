/** Future persisted profile, separate from editable Supabase user_metadata.
 * username must be normalized and reserved atomically by a server/DB UNIQUE
 * constraint. This type provides no uniqueness guarantee or authorization.
 * No tables, queries or RLS policies are implemented in phase 2A.
 */
export interface UserProfile {
  userId: string;
  username: string;
  displayName: string;
}
