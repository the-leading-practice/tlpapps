import { writable } from './lib/store';

export type OpState = {
  lastDate: Date;
};

export const state = writable<OpState>( {lastDate: new Date()} );
