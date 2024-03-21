<script lang="ts">
	import '../../app.postcss';
  import AppBar from "$lib/components/AppBar/AppBar.svelte";
  import AppShell from "$lib/components/AppShell/AppShell.svelte";
  import UserSetting from "$lib/components/UserSetting/UserSetting.svelte";
  import { Toaster } from "$lib/components/Toast";
  import Icon from '@iconify/svelte';

	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { Cog6Tooth } from 'svelte-heros-v2';
	import { sineIn } from 'svelte/easing';
	import { getColorTheme, setColorTheme } from '$lib/utils/colorTheme';

</script>

<div class="h-screen">
  <Toaster />
  <AppShell 
    slotHeader="bg-base-300 font-display p-2" 
    slotSidebarLeft="bg-base-300 p-5 w-auto h-full" 
    slotPageContent="mx-2"
    slotPageHeader="m-2"
    slotPageFooter="m-2">

    <svelte:fragment slot="header">
      <AppBar padding="px-4 py-0">
        <svelte:fragment slot="lead">
          &nbsp;
        </svelte:fragment>

        <h1 class="text-center text-3xl">TLP Apps Admin</h1>

        <svelte:fragment slot="trail">
          <UserSetting shadow="shadow-lg" margin="mt-[5px]" padding='px-2 pt-6' settingDetail='w-[250px]' />
        </svelte:fragment>
      </AppBar>
    </svelte:fragment> 

    <svelte:fragment slot="sidebarLeft">      
      <ul class="menu w-56 rounded-box">
        <li class="text-lg"><a href="/"><Icon icon="mdi:view-dashboard-outline" /> Dashboard</a></li>
        <li>
          <details>
            <summary class="text-lg"><Icon icon="mdi:clipboard-pulse-outline" /> Practice</summary>
            <ul>
              <li class="text-lg"><a href="/practice/onboard"><Icon icon="mdi:account-convert-outline" /> Onboard</a></li>
              <li class="text-lg"><a href="/practice/settings"><Icon icon="mdi:card-bulleted-settings-outline" /> Settings</a></li>
              <li class="text-lg"><a href="/practice/config"><Icon icon="mdi:application-cog-outline" /> Client Config</a></li>
            </ul>
        </li>
        <li>
          <details>
            <summary class="text-lg"><Icon icon="mdi:account-outline" /> User</summary>
            <ul>
              <li class="text-lg"><a href="/profile"><Icon icon="mdi:account-box-outline" /> Profile</a></li>
              <li class="text-lg"><a href="/profile/options"><Icon icon="mdi:cog-outline" /> Options</a></li>
            </ul>
        </li>
      </ul>
    </svelte:fragment> 

    <div class="my-2">
      <slot />
    </div>
  </AppShell>
</div>