/**
 * Supabase service — DEPRECATED (2026-05).
 *
 * Supabase auth has been replaced by GHL SSO → /api/crm/sso → tlp_token.
 * This module is retained as a stub so that imports across the codebase continue
 * to compile without changes while migration to the new auth path completes.
 *
 * ACTION REQUIRED (owner): rotate the Supabase anon key that was previously
 * hardcoded in constants.ts — it was committed to the repo and is compromised.
 * Rotate at: https://app.supabase.com → Project Settings → API → Roll anon key.
 *
 * All methods return inert values; none make network calls.
 */

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { TLPUser } from '$lib/types';

const noop = async () => ({});
const noopErr = async () => ({ error: null, data: {} });

const createUserService = () => {
  const getUsers = async () => ({ data: [], error: null });
  const getUser = async () => {};
  const getProfile = async (_userId?: string): Promise<TLPUser> => ({});
  const getSession = async () => ({ data: { session: null }, error: null });
  const registerAuthStateChange = (_cb: (event: AuthChangeEvent, session: Session | null) => void) => {};
  const registerUser = async (_user: TLPUser) => ({ error: null, data: {} });
  const loginUser = async (_email: string, _password: string) => ({ error: null, data: {} });
  const logoutUser = async () => ({ error: null });
  const updateUser = async (_user: TLPUser, _session: Session) => ({ error: null, profile: null, userResp: {} });
  const downloadAvatar = async (_path: string) => ({ data: null, error: null });
  const getAvatarUrl = async (_path: string) => ({ url: '', error: null });
  const uploadAvatar = async (_files: FileList, _user: TLPUser, _session: Session) => ({ upload: {}, update: {} });

  return {
    getUsers,
    getUser,
    getProfile,
    getSession,
    registerAuthStateChange,
    registerUser,
    updateUser,
    loginUser,
    logoutUser,
    getAvatarUrl,
    downloadAvatar,
    uploadAvatar,
  };
};

export const userService = createUserService();
