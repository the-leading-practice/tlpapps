import { fail, redirect } from '@sveltejs/kit';
import { authService } from '$lib/services/authService.js';
import { userStore } from '$lib/stores/userstore.js';
import { dev } from '$app/environment';

export const actions = {
  default: async ( { request, cookies } ) => {
    const form  = await request.formData();
    const email = form.get( 'email' ) || '';
    const password = form.get( 'password' ) || '';

    if( email.toString().trim().length <= 0 || password.toString().trim().length <= 0 ) {
      throw redirect( 307, '/' );
    }

    const user = await authService.getUserByEmail( email.toString() );
    if( !user || user.password !== password ) {
      return fail( 401, { email, verified: false } ); 
    }

    userStore.set( {
      email: user.email,
      verified: true,
      user: user.user
    } );

    console.log( user );
    throw redirect( 303, '/' );
  }
}