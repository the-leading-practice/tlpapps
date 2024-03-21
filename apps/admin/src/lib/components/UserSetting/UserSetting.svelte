<script lang="ts">
	// import { goto } from "@app/navigation";
	import Icon from "@iconify/svelte";
  // import { userSession, profile } from "$lib/stores/userstore";
	import Avatar from "../Avatar.svelte";
	import type { CssClasses } from "../..";
	// import { userService } from "$lib/services/user";

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
	// let user = $userSession?.user;
  let user = {
    first_name: "Michael",
    last_name: "Heien"
  }

	let displayname = '';
	let email = '';

	// userSession.subscribe( ( session ) => {
	// 	if( session && session.user ) {
	// 		user = session.user;
	// 		displayname = `${user.user_metadata.first_name} ${user.user_metadata.last_name}`;
	// 		email = `${user.email}`;
	// 	}
	// } );

  const toggleMenu = () => {
    menuVisible = menuVisible !== true;
    console.log( menuVisible );
  }

	const handleLogOut = async () => {
		// const { error } = await userService.logoutUser();
		// if( !error ) {
		// 	$goto( '/' );
		// }
	}

  const settingPanelBase = "rounded-box absolute right-4 z-[100]";
  const settingDetailBase = "flex flex-col";
  const settingMenuBase = "menu"; 

  $: settingPanelClass = `${settingPanelBase} ${background} ${border} ${padding} ${margin} ${shadow} ${menuVisible ? "visible" : "hidden"} ${$$props.class ?? ''}`;
  $: settingDetailClass = `${settingDetailBase} ${detailPadding} ${detailBorder} ${settingDetail}`;
  $: settingMenuClass = `${settingMenuBase} ${settingMenu}`;
  
</script>

<div>
  <Avatar name={displayname} width="w-8" on:click={toggleMenu} />

  <div class="setting-panel {settingPanelClass}">
    <div class="setting-panel__details {settingDetailClass}">
      <Avatar name={displayname} margin='mx-auto mb-[10px]' on:click={()=>{location.href = "/wm/profile"}} />
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