<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { AuthSession } from '@supabase/supabase-js';
	import { Toaster } from '$lib/components/Toast';
	import { allUsers, profile, userSession } from '$lib/stores/userstore';
	import { userService } from '$lib/services/supabase';
	import '../app.postcss';

	let session: AuthSession | null;

	// userSession.subscribe( (sess) => {
	// 	session = sess;
	// } )

	// onMount( async () => {
	// 	userService.getSession()
	// 	.then( ( {data} ) => {
  //     console.log( `onMount `, data.session );
	// 		userSession.set( data.session );
	// 	} );

  //   const resp = await userService.getUsers();

  //   if( resp.data ) {
  //     allUsers.set( resp.data );
  //     console.log( $allUsers );
  //   }

	// 	userService.registerAuthStateChange( async ( _event, _session ) => {
	// 		// grab the profile
	// 		if( _event === 'INITIAL_SESSION' || _event === 'SIGNED_IN' || _event === 'USER_UPDATED' ) {
  //       console.log( `signed in`, _session, _session?.user.id );
	// 			const tuser = await userService.getProfile( _session?.user.id );
  //       console.log( `user`, tuser );

	// 			if( tuser.id ) {
	// 				profile.set( tuser );
	// 			}
	// 		}

	// 		if( _event === 'SIGNED_OUT' ) {
	// 			profile.set( {} );
	// 			goto( '/sign-in' ); 
	// 		}

	// 		userSession.set( _session );
	// 	} );

  //   console.log( $userSession );
	// 	console.log( $page )
	// 	if( ( !$userSession || !$userSession.user.id ) && $page.route.id !== '/sign-up' ) {
  //     console.log( $userSession );
	// 		goto( '/sign-in' );
	// 	}

	// } );

</script>

<div class="h-screen">
	<Toaster />
	<slot />
</div>
