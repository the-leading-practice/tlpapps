<script lang="ts">
  /**
   * AllowlistCard — read-only display of the shared per-location write allowlist
   * (GET /api/sync/allowlist). Self-fetching, mirrors the loadControls() pattern
   * in +page.svelte. Deny-all is the fail-closed default and reads as a SAFE
   * state (amber/neutral), not an error (rose).
   */
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api';
  import SyncCard from './SyncCard.svelte';

  let locations: string[] = [];
  let denyAll = false;
  let error: string | null = null;

  async function loadAllowlist() {
    try {
      const res = await apiFetch<{ locations: string[]; denyAll: boolean }>('/sync/allowlist');
      locations = res.locations ?? [];
      denyAll = res.denyAll ?? false;
      error = null;
    } catch (err: any) {
      error = err?.message ?? 'Failed to load allowlist';
    }
  }

  onMount(() => {
    loadAllowlist();
  });
</script>

<SyncCard title="Location Allowlist">
  {#if error}
    <div class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex items-center gap-3 text-sm text-rose-300">
      <span>{error}</span>
    </div>
  {:else if denyAll}
    <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ring-1 bg-amber-500/15 ring-amber-500/30 text-amber-300">
      Deny-all (no locations allowlisted)
    </span>
  {:else if locations.length > 0}
    <div class="flex flex-wrap gap-2">
      {#each locations as loc}
        <span class="inline-flex px-1.5 py-0.5 rounded text-xs border border-base-content/20 text-base-content/70 font-mono">
          {loc}
        </span>
      {/each}
    </div>
  {:else}
    <span class="text-sm text-base-content/50">No locations allowlisted.</span>
  {/if}
</SyncCard>
