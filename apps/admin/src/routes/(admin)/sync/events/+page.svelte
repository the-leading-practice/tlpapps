<script lang="ts">
  import { onMount } from 'svelte';
  import { apiGet } from '$lib/api';
  import Icon from '@iconify/svelte';
  import SyncCard from '$lib/components/Sync/SyncCard.svelte';
  import StatusPill from '$lib/components/Sync/StatusPill.svelte';
  import { formatDateTime } from '$lib/utils/stringUtils';

  let loading = true;
  let error = '';
  let events: any[] = [];
  let statusFilter = '';
  let limitStr = '50';

  async function load() {
    loading = true;
    error = '';
    try {
      const params = new URLSearchParams({ limit: limitStr });
      if (statusFilter) params.set('status', statusFilter);
      const resp = await apiGet<{ events: any[] }>(`/sync/events?${params}`);
      events = resp.events ?? [];
    } catch (e: any) {
      error = e.message || 'Failed to load events';
    } finally {
      loading = false;
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>Sync Events</title>
</svelte:head>

<div class="flex flex-col gap-5">

  <!-- Header row -->
  <div class="flex items-center justify-between">
    <h2 class="text-xl font-semibold text-base-content">Sync Events</h2>
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-2">
    <select
      class="select select-sm bg-base-200 border border-base-content/15 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
      bind:value={statusFilter}
      on:change={load}
    >
      <option value="">All statuses</option>
      <option value="pending">Pending</option>
      <option value="processed">Processed</option>
      <option value="failed">Failed</option>
      <option value="dead">Dead</option>
    </select>
    <select
      class="select select-sm bg-base-200 border border-base-content/15 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
      bind:value={limitStr}
      on:change={load}
    >
      <option value="25">25 rows</option>
      <option value="50">50 rows</option>
      <option value="100">100 rows</option>
      <option value="500">500 rows</option>
    </select>
    <button
      class="btn btn-sm bg-base-200 border border-base-content/15 hover:bg-base-content/10 rounded-lg flex items-center gap-1.5 text-sm"
      on:click={load}
      aria-label="Refresh events"
    >
      <Icon icon="mdi:refresh" class="text-base" />
      Refresh
    </button>
  </div>

  {#if loading}
    <div class="flex justify-center py-16">
      <span class="loading loading-spinner loading-lg text-blue-400"></span>
    </div>
  {:else if error}
    <div class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex items-center gap-3 text-sm text-rose-300">
      <Icon icon="mdi:alert-circle-outline" class="text-lg shrink-0" />
      <span>{error}</span>
    </div>
  {:else}
    <SyncCard padBody={false}>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-xs text-base-content/50 uppercase tracking-wide border-b border-base-content/10">
              <th class="text-left px-5 py-3 font-medium">ID</th>
              <th class="text-left px-4 py-3 font-medium">Source</th>
              <th class="text-left px-4 py-3 font-medium">Action</th>
              <th class="text-left px-4 py-3 font-medium">Dedup Key</th>
              <th class="text-left px-4 py-3 font-medium">Status</th>
              <th class="text-left px-4 py-3 font-medium">Error</th>
              <th class="text-left px-4 py-3 font-medium">Received</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-base-content/5">
            {#if events.length === 0}
              <tr>
                <td colspan="7" class="py-12 text-center text-base-content/40 text-sm">
                  No events matching filters
                </td>
              </tr>
            {:else}
              {#each events as ev}
                <tr class="hover:bg-base-content/5 transition-colors">
                  <td class="px-5 py-2.5 font-mono text-xs text-base-content/60">{ev.id?.slice(0, 8)}…</td>
                  <td class="px-4 py-2.5">
                    <span class="inline-flex px-1.5 py-0.5 rounded text-xs border border-base-content/20 text-base-content/70 font-mono">{ev.source}</span>
                  </td>
                  <td class="px-4 py-2.5 text-sm">{ev.action}</td>
                  <td class="px-4 py-2.5 font-mono text-xs text-base-content/50 max-w-[10rem] truncate" title={ev.dedupKey ?? ev.dedup_key ?? ''}>
                    {ev.dedupKey ?? ev.dedup_key ?? '—'}
                  </td>
                  <td class="px-4 py-2.5"><StatusPill status={ev.status} /></td>
                  <td class="px-4 py-2.5 text-xs text-rose-400 max-w-xs truncate" title={ev.error ?? ''}>{ev.error ?? ''}</td>
                  <td class="px-4 py-2.5 text-xs text-base-content/50 whitespace-nowrap">{formatDateTime(ev.receivedAt ?? ev.received_at)}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </SyncCard>
  {/if}

</div>
