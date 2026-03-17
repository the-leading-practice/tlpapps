import { Invalidator } from './private.js';

export type Subscriber<T> = ( value: T ) => void;

export type Unsubscriber = () => void;

export type Updater<T> = ( value: T ) => T;

export type StartStopNotifier<T> = (
  set: ( value: T ) => void,
  update: ( fn: Updater<T> ) => void
) => void | ( () => void );

export interface Readable<T> {
  subscribe( this: void, run: Subscriber<T>, invalidate?: Invalidator<T> ): Unsubscriber;
}

export interface Writable<T> extends Readable<T> {
  set( this: void, value: T ): void;

  update( this: void, updater: Updater<T> ): void;
}

export * from './index.js';
