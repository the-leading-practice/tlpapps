<script lang="ts">
  import { page } from '$app/stores';

  const tabs = [
    { label: 'Dashboard', href: '/sync' },
    { label: 'Events',    href: '/sync/events' },
    { label: 'Conflicts', href: '/sync/conflicts' },
    { label: 'Dead Letter', href: '/sync/dead-letter' },
    { label: 'Controls', href: '/sync/controls' },
  ];

  $: active = $page.url.pathname;
</script>

<div class="tabs tabs-boxed mb-4">
  {#each tabs as tab}
    <a
      href={tab.href}
      class="tab {active === tab.href ? 'tab-active' : ''}"
    >
      {tab.label}
    </a>
  {/each}
</div>

<slot />
