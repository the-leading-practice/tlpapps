<script lang="ts">
  import { onMount } from 'svelte';
  import { apiGet, apiPost } from '$lib/api';
  import Icon from '@iconify/svelte';

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

<div class="flex items-center justify-between mb-5">
  <h2 class="text-2xl uppercase">Dead Letter Queue</h2>
  <a href="/sync" class="btn btn-xs btn-ghost">← Dashboard</a>
</div>

{#if replaySuccess}
  <div class="alert alert-success mb-4">
    <Icon icon="mdi:check-circle-outline" />
    <span>{replaySuccess}</span>
  </div>
{/if}
{#if replayError}
  <div class="alert alert-error mb-4">
    <Icon icon="mdi:alert-circle-outline" />
    <span>{replayError}</span>
  </div>
{/if}

<div class="flex gap-3 mb-4">
  <button class="btn btn-sm btn-outline" on:click={load}>
    <Icon icon="mdi:refresh" /> Refresh
  </button>
  <span class="text-sm opacity-60 self-center">Showing failed events — click Replay to re-arm for processing</span>
</div>

{#if loading}
  <div class="flex justify-center py-12">
    <span class="loading loading-spinner loading-lg"></span>
  </div>
{:else if error}
  <div class="alert alert-error mb-4">
    <Icon icon="mdi:alert-circle-outline" />
    <span>{error}</span>
  </div>
{:else}
  <div class="card bg-base-200 shadow-lg">
    <div class="card-body p-0">
      <div class="overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>ID</th>
              <th>Source</th>
              <th>Action</th>
              <th>Error</th>
              <th>Received</th>
              <th>Replay</th>
            </tr>
          </thead>
          <tbody>
            {#if events.length === 0}
              <tr><td colspan="6" class="text-center py-8 opacity-60">No failed events — queue is clear</td></tr>
            {:else}
              {#each events as ev}
                <tr>
                  <td class="font-mono text-xs">{ev.id?.slice(0, 8)}…</td>
                  <td><span class="badge badge-outline badge-sm">{ev.source}</span></td>
                  <td class="text-sm">{ev.action}</td>
                  <td class="text-xs text-error max-w-xs truncate">{ev.error ?? '—'}</td>
                  <td class="text-xs opacity-70 whitespace-nowrap">
                    {new Date(ev.receivedAt ?? ev.received_at).toLocaleString()}
                  </td>
                  <td>
                    <button
                      class="btn btn-xs btn-warning"
                      disabled={replaying === ev.id}
                      on:click={() => replay(ev.id)}
                    >
                      {#if replaying === ev.id}
                        <span class="loading loading-xs"></span>
                      {:else}
                        <Icon icon="mdi:replay" />
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
    </div>
  </div>
{/if}
