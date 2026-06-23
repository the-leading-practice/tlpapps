<script lang="ts">
	import { goto } from "$app/navigation";
	import { onMount } from "svelte";
	import Icon from "@iconify/svelte";
	import Avatar from "../Avatar/Avatar.svelte";
	import type { CssClasses } from "$lib";
	import { getSession, sessionDisplayName } from "$lib/utils/session";

  export let settingDetail: CssClasses = '';
  export let settingMenu: CssClasses = '';

  export let background: CssClasses = 'bg-base-200';
  export let border: CssClasses = '';
  export let padding: CssClasses = '';
  export let margin: CssClasses = '';
  export let shadow: CssClasses = '';

  export let detailPadding: CssClasses = '';
  export let detailBorder: CssClasses = '';

  let menuVisible = false;

	// Identity comes from the GHL-SSO JWT (tlp_token), not Supabase.
	let displayname = '';
	let email = '';
  let color = '';
  let avatarUrl = '';

	onMount( () => {
		const s = getSession();
		displayname = sessionDisplayName( s );
		// Location-scoped auth: surface the location id as the secondary line
		// (there is no per-user email in this model).
		email = s?.location ? `Location: ${s.location}` : '';
	} );

  const removeClickOutside = () => {
    removeEventListener( 'click', handleClickOutside );
  }

  const handleClickOutside = ( event: MouseEvent ) => {
    const elem = document.getElementsByClassName( 'user-setting' )[0];
    const inBounds = event.composedPath().includes( elem );

    if( !inBounds && menuVisible ) {
      toggleMenu();
      removeClickOutside();
    }
  }

  const toggleMenu = () => {
    menuVisible = menuVisible !== true;

    if( menuVisible ) {
      document.addEventListener( 'click', handleClickOutside );
    } else {
      removeClickOutside()
    }
  }

	const handleLogOut = async () => {
		// SSO session = the tlp_token JWT. Clearing it logs out; the sync guard
		// re-runs the GHL SSO handshake on next protected page.
		if( typeof localStorage !== 'undefined' ) {
			localStorage.removeItem( 'tlp_token' );
		}
		goto( '/embed' );
	}

  const settingPanelBase = "rounded-box absolute right-4 z-[100]";
  const settingDetailBase = "flex flex-col";
  const settingMenuBase = "menu"; 

  $: settingPanelClass = `${settingPanelBase} ${background} ${border} ${padding} ${margin} ${shadow} ${menuVisible ? "visible" : "hidden"} ${$$props.class ?? ''}`;
  $: settingDetailClass = `${settingDetailBase} ${detailPadding} ${detailBorder} ${settingDetail}`;
  $: settingMenuClass = `${settingMenuBase} ${settingMenu}`;
  
</script>

<div class="user-setting">
  <Avatar image={avatarUrl} name={displayname} width="w-8" on:click={toggleMenu} background={color} />

  <div class="setting-panel {settingPanelClass}">
    <div class="setting-panel__details {settingDetailClass}">
      <Avatar image={avatarUrl} name={displayname} margin='mx-auto mb-[10px]' on:click={()=>{location.href = "/profile"}} background={color} />
      <div class="w-fit m-auto"><a href="/profile" on:click={toggleMenu}>{displayname}</a></div>
      <div class="w-fit m-auto">{email}</div>
    </div>
    <div class="divider"></div>
    <ul class="{settingMenuClass}">
      <li><a href="/profile/options" on:click={toggleMenu}><Icon icon="mdi:cog" />Options</a></li>
      <li><button on:click={handleLogOut}><Icon icon="mdi:logout" />Log Out</button></li>
    </ul>
  </div>
</div>