<script lang="ts">
  import { onMount } from 'svelte';
  import { apiGet, apiPost } from '$lib/api';
  import Icon from '@iconify/svelte';
  import SyncCard from '$lib/components/Sync/SyncCard.svelte';

  let loading = true;
  let error = '';
  let events: any[] = [];
  let replaying: string | null = null;
  let replayError = '';
  let replaySuccess = '';

  async function load() {
    loading = true;
    error = '';
    try {
      const resp = await apiGet<{ events: any[] }>('/sync/events?status=failed&limit=100');
      events = resp.events ?? [];
    } catch (e: any) {
      error = e.message || 'Failed to load dead-letter events';
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function replay(id: string) {
    replaying = id;
    replayError = '';
    replaySuccess = '';
    try {
      await apiPost(`/sync/events/replay/${id}`, {});
      replaySuccess = `Event ${id.slice(0, 8)}… re-armed for replay.`;
      await load();
    } catch (e: any) {
      replayError = e.message || 'Replay failed';
    } finally {
      replaying = null;
    }
  }
</script>

<svelte:head>
  <title>Dead Letter Queue</title>
</svelte:head>

<div class="flex flex-col gap-5">

  <div class="flex items-center justify-between">
    <h2 class="text-xl font-semibold text-base-content">Dead Letter Queue</h2>
  </div>

  {#if replaySuccess}
    <div class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-center gap-3 text-sm text-emerald-300">
      <Icon icon="mdi:check-circle-outline" class="text-lg shrink-0" />
      <span>{replaySuccess}</span>
    </div>
  {/if}

  {#if replayError}
    <div class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex items-center gap-3 text-sm text-rose-300">
      <Icon icon="mdi:alert-circle-outline" class="text-lg shrink-0" />
      <span>{replayError}</span>
    </div>
  {/if}

  <div class="flex items-center gap-3">
    <button
      class="btn btn-sm bg-base-200 border border-base-content/15 hover:bg-base-content/10 rounded-lg flex items-center gap-1.5 text-sm"
      on:click={load}
      aria-label="Refresh dead-letter queue"
    >
      <Icon icon="mdi:refresh" class="text-base" />
      Refresh
    </button>
    <span class="text-xs text-base-content/40">Failed events — click Replay to re-arm for processing</span>
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
              <th class="text-left px-4 py-3 font-medium">Error</th>
              <th class="text-left px-4 py-3 font-medium">Received</th>
              <th class="text-left px-4 py-3 font-medium">Replay</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-base-content/5">
            {#if events.length === 0}
              <tr>
                <td colspan="6" class="py-12 text-center">
                  <div class="flex flex-col items-center gap-2 text-base-content/40">
                    <Icon icon="mdi:inbox-outline" class="text-2xl" />
                    <span class="text-sm">Queue is clear — no failed events</span>
                  </div>
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
                  <td class="px-4 py-2.5 text-xs text-rose-400 max-w-xs truncate" title={ev.error ?? ''}>{ev.error ?? '—'}</td>
                  <td class="px-4 py-2.5 text-xs text-base-content/50 whitespace-nowrap">
                    {new Date(ev.receivedAt ?? ev.received_at).toLocaleString()}
                  </td>
                  <td class="px-4 py-2.5">
                    <button
                      class="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/15 ring-1 ring-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                      disabled={replaying === ev.id}
                      on:click={() => replay(ev.id)}
                      aria-label="Replay event {ev.id}"
                    >
                      {#if replaying === ev.id}
                        <span class="loading loading-xs"></span>
                      {:else}
                        <Icon icon="mdi:replay" class="text-sm" />
                      {/if}
                      Replay
                    </button>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </SyncCard>
  {/if}

</div>
