<script lang="ts">
	import { goto } from '$app/navigation';
  import Icon from '@iconify/svelte';
	import { userService } from '$lib/services/supabase';
	import { userSession, profile } from '$lib/stores/userstore';

  let email: string = '';
  let password: string = '';
  let value: string = '';
  let pwType: string = "password";

	userSession.subscribe( (sess) => {
		if( sess ) {
			goto( '/' );
		}
	} );

  profile.subscribe( (p) => {
    if( p && p.id ) {
      goto( '/' );
    }
  } );

  const handleInput = ( event: any ) => {
    if( event.target ) {
      value = (event.target as HTMLInputElement).value; 
			password = value;
    }
  }

  const toggleShowP = ( event: MouseEvent ) => {
    event.preventDefault();
    pwType = pwType === "password" ? "text" : "password";
  }

  const submitLogin = async ( event: MouseEvent ) => {
    // event.preventDefault();
    console.log( `got here`, event );
    const {error, data} = await userService.loginUser( email, password );
  }

</script>

<div class="sign-in-card card w-[450px] shadow-xl bordered">
  <div class="card-body">
    <h3 class="card-title">User Login</h3>
        
      <label for="email" class="label">Email</label>
      <input placeholder="Email" id="email" name="email" type="email" class="input input-bordered w-full" bind:value={email} />

      <label for="password" class="label">Password</label>
      <div class="join w-full">
        <input placeholder="Password" id="password" name="password" type={pwType} class="input input-bordered join-item w-full" on:input={handleInput} />
        <button on:click={ toggleShowP } class="btn btn-neutral join-item w-[50px]">
          {#if pwType==="password"}
            <Icon icon="mdi:eye" />
          {:else}
            <Icon icon="mdi:eye-off" />
          {/if}
        </button>
      </div>
    
      <button class="btn btn-primary" on:click={submitLogin}>Sign In</button>

    <div class="divider">or</div>

    <button class="btn btn-secondary w-full" color="light" on:click={()=>{document.location = "/sign-up"}}>Register</button>
  </div>
</div>

<style>
.sign-in-card {
  position:absolute;
  top: 50%;
  left: 50%;
  transform: translate( -50%, -50% );
}
</style>