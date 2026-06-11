<script lang="ts">
  import { page } from '$app/stores';

  const tabs = [
    { label: 'Dashboard',   href: '/sync',             icon: 'mdi:view-dashboard-outline' },
    { label: 'Events',      href: '/sync/events',      icon: 'mdi:format-list-bulleted' },
    { label: 'Conflicts',   href: '/sync/conflicts',   icon: 'mdi:alert-outline' },
    { label: 'Dead Letter', href: '/sync/dead-letter', icon: 'mdi:email-alert-outline' },
    { label: 'Controls',    href: '/sync/controls',    icon: 'mdi:toggle-switch-outline' },
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
