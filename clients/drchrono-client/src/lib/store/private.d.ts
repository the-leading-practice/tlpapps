import { Readable, Subscriber } from './public.js';

export type Invalidator<T> = ( value?: T ) => void;

export type SubscribeInvalidateTuple<T> = [Subscriber<T>, Invalidator<T>];

export type Stores =
  | Readable<any>
  | [Readable<any>, ...Array<Readable<any>>]
  | Array<Readable<any>>;

export type StoresValues<T> =
  T extends Readable<infer U> ? U : { [K in keyof T] : T[K] extends Readable<infer U> ? U : never };
