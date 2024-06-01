import type { TLPUser } from "$lib/types";
import type { Session } from "@supabase/supabase-js";
import { writable } from "svelte/store";

export const userSession = writable<Session | null>();

export const profile = writable<TLPUser | null>();

export const allUsers = writable<TLPUser[]>();