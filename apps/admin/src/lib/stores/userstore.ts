import { writable } from "svelte/store";
import type { LoginData } from "$lib/types/common";

const createUserStore = () => {
  const { subscribe, set, update } = writable<LoginData>( {
    email: "",
    password: "",
    verified: false
  } );

  return {
    subscribe,
    set,
    update,
  }
}

export const userStore = createUserStore();