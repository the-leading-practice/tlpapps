<script lang="ts">
  import { goto } from '$app/navigation'
	import { formActionHelper } from '$lib/actions/formActionHelper';
	import { addToast } from '$lib/components/Toast';
	import { userService } from '$lib/services/supabase';
	import type { TLPUser } from '$lib/types';
	import { validateEmail } from '$lib/utils/stringUtils';
  import Icon from '@iconify/svelte';

  let email: string = '';
  let firstName: string = '';
  let lastName: string = '';
  let value: string = '';
  let confirmPassword: string = '';
  let pwType: string = "password";

  let user: TLPUser = {
    email: '',
    first_name: '',
    last_name: '',
    modified_at: '',
    password: ''
  };

  const handleInput = ( event: any ) => {
    if( event.target ) {
			value = (event.target as HTMLInputElement).value;   
			user.password = value;   
    }
  }

  const toggleShowP = ( event: MouseEvent ) => {
    event.preventDefault();
    pwType = pwType === "password" ? "text" : "password";
  }

  function validatePassword( password: string, confirmPassword: string ) {
    return confirmPassword !== password 
  }

  const {data, formAction} = formActionHelper( {
    action: '',
    method: 'post',
    isJson: false,
		validation: {
			email: ( elem: HTMLInputElement ) => {
				if( elem.value.length <= 0 ) {
					return { passed: false, message: "Email is required" }
				}

				if( !validateEmail( elem.value ) ) {
					return { passed: false, message: "The email must be a valid email address" }
				}

				return { passed: true }
			},
			password: ( elem: HTMLInputElement ) => { 
				if( elem.value.length <= 0 ) {
					return { passed: false, message: 'Password is required' };
				}

				if( elem.value.length < 8 ) {
					return { passed: false, message: 'password is too short, must be at least 8 characters' }
				}

				return { passed: true };
			 }
		},
		
		onError: ( failed ) => {
			addToast( {
				id: 0,
				type: "error",
				dismissible: false,
				timeout: 5000,
				message: `${failed[0].message}`

			} );
		},

		onSubmit: async () => {
			let resp = await userService.registerUser( user )
			console.log( resp.error, resp.data );

			if( !resp.error ) {
				goto( '/sign-up/confirm' );
			}

			else {
				addToast( {
					id: 0,
					type: "error",
					dismissible: false,
					timeout: 5000,
					message: `${resp.error.toString()}`

				} );
			}
		}
  } );

</script>

<div class="sign-in-card card w-[450px] shadow-xl bordered">
  <div class="card-body">
    <h3 class="card-title">Register for an Account</h3>
    <form method="post" class="space-y-5 {$$props.class}" use:formAction>
      
      <label for="email" class="label">Email</label>
      <input id="email" name="email" type="email" class="input input-bordered w-full" bind:value={user.email} required />

      <label for="firstName" class="label">First Name</label>
      <input id="firstName" name="firstName" type="firstName" class="input input-bordered w-full" bind:value={user.first_name} required />

      <label for="lastName" class="label">Last Name</label>
      <input id="lastName" name="lastName" type="lastName" class="input input-bordered w-full" bind:value={user.last_name} required />

      <label for="password" class="label">Password</label>
      <div class="join w-full">
        <input id="password" name="password" {value} type={pwType} class="input input-bordered join-item w-full" on:input={handleInput} />
        <button on:click={ toggleShowP } class="btn btn-neutral join-item w-[50px]">
          {#if pwType==="password"}
            <Icon icon="mdi:eye" />
          {:else}
            <Icon icon="mdi:eye-off" />
          {/if}
        </button>
      </div>

      <label for="confirm" class="label">Confirm Password</label>
      <input id="confirm" name="confirm" type="password" class="input input-bordered join-item w-full" bind:value={confirmPassword} />
    
      {#if confirmPassword !== "" && confirmPassword !== value}
      <p class="text-red-600 text-sm font-semibold">Password do not match</p>
      {:else if confirmPassword === ""}
        <p class="text-red-600 text-sm font-semibold">&nbsp</p>
      {:else}
        <p class="text-green-400 text-sm font-semibold">Password match</p>
      {/if}
      <button class="btn btn-primary w-full" type="submit" disabled="{validatePassword(value, confirmPassword)}">Sign Up</button>

    </form>
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