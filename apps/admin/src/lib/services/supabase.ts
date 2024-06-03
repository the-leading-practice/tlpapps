import { 
  createClient, 
  type AuthChangeEvent, 
  type Session } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '$lib/constants';
import type { TLPUser } from '$lib/types';

const createUserService = () => {
  const supabase = createClient( SUPABASE_URL, SUPABASE_KEY );

	const getUsers = async () => {
		const resp = await supabase
			.from( 'profiles' )
			.select( '*, user_roles( roles )' );

		return resp;
	}
  
	const getUser = async () => {
		const { data: { user } } = await supabase.auth.getUser();

		console.log( user );
  }

	const getProfile = async ( userId?: string ): Promise<TLPUser> => {
    let gid: string | null = userId ?? '';

		if( !userId ) {
			const { data: { user } } = await supabase.auth.getUser();
			gid = user ? user.id : null;
		}

    console.log( gid );
		if( gid ) {

			const { data, error, status } = await supabase
				.from( 'profiles' )
				.select( `*, user_roles( user_id, roles )` )
				.eq( 'id', gid )
				.single();

			if( error && status !== 406 ) throw error;
      console.log( data );
			if( data ) {
				return { ...data };
			}
		}

		return {};
	}

	const getSession = async () => {
		return await supabase.auth.getSession();
	}

	const registerAuthStateChange = ( callback: ( event: AuthChangeEvent, session: Session | null ) => void ) => {
		supabase.auth.onAuthStateChange( callback );
	}

  const registerUser = async ( user: TLPUser ) => {
		console.log( user );
		if( user.email && user.password ) {
			const { data, error } = await supabase.auth.signUp( {
				email: user.email,
				password: user.password,
				options: {
					data: {
						first_name: user.first_name,
						last_name: user.last_name
					}
				}
			} );

			if( data && data.user ) {
				const { error: insertError } = await supabase
					.from( 'profiles' )
					.insert( [
						{
							id: data.user.id,
							first_name: user.first_name,
							last_name: user.last_name
						}
					] );

				if( insertError ) {
					console.log( `error inserting user into profiles table`, insertError );
				}
			}

			if( error ) {
				console.log( error );
			}

			return {error: error || null, data: data || {}}
		}

		return {error: "no email or passord", data:{}};
  }

  const loginUser = async ( email: string, password: string ) => {
    console.log( `in here`, supabase );
		const { data, error } = await supabase.auth.signInWithPassword( {
			email: email,
			password: password
		} );

    console.log( data, error );

		if( error ) {
			console.log( error );
		}
		
		return {error: error || {}, data: data || {}}
  }

	const logoutUser = async() => {
		const { error } = await supabase.auth.signOut();

		return {error}
	}

  const updateUser = async( user: TLPUser, session: Session ) => {
    // update profile
    const { data: profile, error } = await supabase
      .from( 'profiles' )
      .update( {
				first_name: user.first_name,
				last_name: user.last_name,
				freshdesk_id: user.freshdesk_id, 
				asana_id: user.asana_id,
        profile_color: user.profile_color,
        avatar_url: user.avatar_url,
        email: user.email
			} )
			.eq( 'id', user.id )
			.select();

		console.log( `update resp`, error );

    // update user
    let userResp = {};
    const upd: {email?:string, password?:string} = {};

    if( user.email !== session.user.email ) {
      upd.email = user.email;

      if( user.password ) {
        upd.password = user.password;
      }

      userResp = await supabase.auth.updateUser( upd );
    }

		return {error, profile, userResp};
  }

  const downloadAvatar = async( path: string ) => {
    const { data, error } = await supabase.storage.from( 'avatars' ).download( path );

    return {data, error};
  }

  const getAvatarUrl = async( path: string ) => {
    const { data, error } = await supabase.storage.from( 'avatars' ).download( path );
    let url: string = '';

    if( data ) {
      url = URL.createObjectURL( data );
    }

    return {url, error};
  }

	const uploadAvatar = async ( files: FileList, user: TLPUser, session: Session ) => {
    const file = files[0];
    const fileExt = file.name.split( '.' ).pop();
    const filePath = `avatar_${user.id}.${fileExt}`;

    console.log( `entering` );
    let ret = await downloadAvatar( filePath );
    let uploadRet;
    
    if( ret.error ) {
		  uploadRet = await supabase.storage.from( "avatars" ).upload( filePath, file );
    } else {
      uploadRet = await supabase.storage.from( "avatars" ).update( filePath, file );
    }
    console.log( `finished` );

    user.avatar_url = filePath;
    const userUpdate = await updateUser( user, session );

    return { upload: uploadRet, update: userUpdate };
	}

  return {
		getUsers,
    getUser,
		getProfile,
		getSession,
		registerAuthStateChange,
    registerUser,
    updateUser,
    loginUser,
		logoutUser,
    getAvatarUrl,
    downloadAvatar,
		uploadAvatar
  }
}

export const userService = createUserService();