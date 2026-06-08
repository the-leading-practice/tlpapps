<script lang="ts">
  import { onMount } from 'svelte';
  import { apiGet } from '$lib/api';
  import Icon from '@iconify/svelte';

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

  function badge(status: string) {
    if (status === 'processed') return 'badge-success';
    if (status === 'pending') return 'badge-warning';
    if (status === 'failed' || status === 'dead') return 'badge-error';
    return 'badge-ghost';
  }
</script>

<svelte:head>
  <title>Sync Events</title>
</svelte:head>

<div class="flex items-center justify-between mb-5">
  <h2 class="text-2xl uppercase">Sync Events</h2>
  <a href="/sync" class="btn btn-xs btn-ghost">← Dashboard</a>
</div>

<!-- Filters -->
<div class="flex flex-wrap gap-3 mb-4">
  <select class="select select-bordered select-sm" bind:value={statusFilter} on:change={load}>
    <option value="">All statuses</option>
    <option value="pending">Pending</option>
    <option value="processed">Processed</option>
    <option value="failed">Failed</option>
    <option value="dead">Dead</option>
  </select>
  <select class="select select-bordered select-sm" bind:value={limitStr} on:change={load}>
    <option value="25">25</option>
    <option value="50">50</option>
    <option value="100">100</option>
    <option value="500">500</option>
  </select>
  <button class="btn btn-sm btn-outline" on:click={load}>
    <Icon icon="mdi:refresh" /> Refresh
  </button>
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
              <th>Dedup Key</th>
              <th>Status</th>
              <th>Error</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {#if events.length === 0}
              <tr><td colspan="7" class="text-center py-8 opacity-60">No events matching filters</td></tr>
            {:else}
              {#each events as ev}
                <tr>
                  <td class="font-mono text-xs">{ev.id?.slice(0, 8)}…</td>
                  <td><span class="badge badge-outline badge-sm">{ev.source}</span></td>
                  <td class="text-sm">{ev.action}</td>
                  <td class="font-mono text-xs opacity-70">{ev.dedupKey ?? ev.dedup_key ?? '—'}</td>
                  <td><span class="badge badge-sm {badge(ev.status)}">{ev.status}</span></td>
                  <td class="text-xs text-error max-w-xs truncate">{ev.error ?? ''}</td>
                  <td class="text-xs opacity-70 whitespace-nowrap">{new Date(ev.receivedAt ?? ev.received_at).toLocaleString()}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </div>
{/if}
