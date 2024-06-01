<script lang="ts">
	import { goto } from "$app/navigation";
	import Icon from "@iconify/svelte";
  import { userSession, profile } from "$lib/stores/userstore";
	import Avatar from "../Avatar/Avatar.svelte";
	import type { CssClasses } from "$lib";
	import { userService } from "$lib/services/supabase";
	import type { Mouse } from "@playwright/test";

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
	let user = $userSession?.user;

	let displayname = '';
	let email = '';
  let color = '';
  let avatarUrl = '';

	userSession.subscribe( ( session ) => {
		if( session && session.user ) {
			user = session.user;
			displayname = `${user.user_metadata.first_name} ${user.user_metadata.last_name}`;
			email = `${user.email}`;
		}
	} );

  profile.subscribe( async (p) => {
    if( p ) {
      color = `${p.profile_color}`;
      console.log( color );

      if( p.avatar_url ) {
        const {url, error} = await userService.getAvatarUrl( p.avatar_url );
        avatarUrl = url;
        
        if( error ) {
          console.log( error );
        }
      }
    }
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
		const { error } = await userService.logoutUser();
		if( !error ) {
			goto( '/' );
		}
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
      <Avatar image={avatarUrl} name={displayname} margin='mx-auto mb-[10px]' on:click={()=>{location.href = "/a/profile"}} background={color} />
      <div class="w-fit m-auto"><a href="/a/profile" on:click={toggleMenu}>{displayname}</a></div>
      <div class="w-fit m-auto">{email}</div>
    </div>
    <div class="divider"></div>
    <ul class="{settingMenuClass}">
      <li><a href="/a/profile/options" on:click={toggleMenu}><Icon icon="mdi:cog" />Options</a></li>
      <li><button on:click={handleLogOut}><Icon icon="mdi:logout" />Log Out</button></li>
    </ul>
  </div>
</div>