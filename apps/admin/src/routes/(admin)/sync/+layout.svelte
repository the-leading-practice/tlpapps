<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getSession } from '$lib/utils/session';

  // Auth guard: the sync panel needs a valid (non-expired) TLP JWT minted via
  // GHL SSO in /embed. If it's missing OR expired — e.g. the panel was opened
  // directly, or the 24h token lapsed — bounce to /embed to re-run the SSO
  // handshake, preserving the intended destination so we land back here.
  onMount(() => {
    if (!getSession()) {
      const dest = encodeURIComponent($page.url.pathname);
      goto(`/embed?return=${dest}`);
    }
  });

  const tabs = [
    { label: 'Dashboard',   href: '/sync',             icon: 'mdi:view-dashboard-outline' },
    { label: 'Events',      href: '/sync/events',      icon: 'mdi:format-list-bulleted' },
    { label: 'Conflicts',   href: '/sync/conflicts',   icon: 'mdi:alert-outline' },
    { label: 'Dead Letter', href: '/sync/dead-letter', icon: 'mdi:email-alert-outline' },
    { label: 'Controls',    href: '/sync/controls',    icon: 'mdi:toggle-switch-outline' },
    { label: 'Calendar Mapping', href: '/sync/calendar-map', icon: 'mdi:calendar-sync-outline' },
  ];

  $: active = $page.url.pathname;
</script>

<div class="mb-6">
  <!-- Tab bar -->
  <div class="flex flex-wrap gap-1 border-b border-base-content/10 pb-0">
    {#each tabs as tab}
      {@const isActive = active === tab.href}
      <a
        href={tab.href}
        class="
          flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg
          border-b-2 transition-colors duration-150
          {isActive
            ? 'border-blue-500 text-blue-400 bg-blue-500/10'
            : 'border-transparent text-base-content/50 hover:text-base-content/80 hover:bg-base-content/5'}
        "
        aria-current={isActive ? 'page' : undefined}
      >
        {tab.label}
      </a>
    {/each}
  </div>
</div>

<slot />
