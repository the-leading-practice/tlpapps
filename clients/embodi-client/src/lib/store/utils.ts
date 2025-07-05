import { noop } from '../common';
import { Invalidator } from './private';
import { Readable } from './public';

export function subscribe_to_store<T>( store: Readable<T> | null | undefined, run:(value: T) => void, invalidate?:Invalidator<T> ) {
  if( store === null ) {
    // @ts-expect-error
    run( undefined );

    if( invalidate ) invalidate( undefined );

    return noop;
  }

  const unsub = store?.subscribe( run, invalidate );
  return unsub || noop;
}