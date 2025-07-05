import {writable} from './lib/store';
import { getDateString } from './lib/utils/date';

export type OpState = {
  lastDate: Date;
}

export const state = writable<OpState>( {lastDate: new Date()} );