import { noop, run } from '../common';
import { Invalidator, SubscribeInvalidateTuple } from './private';
import { StartStopNotifier, Updater, Subscriber, Unsubscriber, Readable } from './public';
import { subscribe_to_store } from './utils';

const subscriberQueue: SubscribeInvalidateTuple<any> | any = [];

export const safe_not_equal = ( a: any, b: any ) => {
	// eslint-disable-next-line eqeqeq
	return a != a
		? // eslint-disable-next-line eqeqeq
			b == b
		: a !== b || (a && typeof a === 'object') || typeof a === 'function';
}

export function readable<T>( value: T, start: StartStopNotifier<T> ) {
  return {
    subscribe: writable<T>( value, start ).subscribe
  };
}

export function writable<T>( value: T, start: StartStopNotifier<T> = noop ) {
  const subscribers = new Set<SubscribeInvalidateTuple<T>>();
  let stop: Unsubscriber | null = null;

  function set( newValue: T ) {
    if( safe_not_equal( value, newValue ) ) {
      value = newValue;

      if( stop ) {
        const runQueue = !subscriberQueue.length;
        for( const subscriber of subscribers ) {
          subscriber[1]();
          subscriberQueue.push( subscriber, value );
        }

        if( runQueue ) {
          for( let i = 0; i < subscriberQueue.length; i += 2 ) {
            subscriberQueue[i][0]( subscriberQueue[i+1] );
          }
          subscriberQueue.length = 0;
        }
      }
    }
  }

  function update( func: Updater<T> ) {
    set( func( value ) );
  }

  function subscribe( run:Subscriber<T>, invalidate: Invalidator<T> = noop ) {
    const subscriber: SubscribeInvalidateTuple<T> = [run, invalidate];

    subscribers.add( subscriber );
    if( subscribers.size === 1 ) {
      stop = start( set, update ) || noop;
    }
    run( value );

    return () => {
      subscribers.delete( subscriber );
      if( subscribers.size === 0 && stop ) {
        stop();
        stop = null;
      }
    };
  }

  return {
    set,
    update,
    subscribe
  }
}

export function get_store_value<T>( store: Readable<T> ) {
  let value;
  subscribe_to_store( store, ( v ) => ( value = v ) )();
  return value;
}

export { get_store_value as get };
