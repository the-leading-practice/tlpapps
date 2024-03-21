// import { redirect } from '@sveltejs/kit';
// import { get } from 'svelte/store';
// import type { PageLoad } from './$types';
// import { userStore } from '$lib/stores/userstore';

// export const load : PageLoad = async ( {fetch, params} ) => {
//   const user = get( userStore );

//   if( !user.verified ) {
//     throw redirect( 307, '/sign-in' );
//   }
// }