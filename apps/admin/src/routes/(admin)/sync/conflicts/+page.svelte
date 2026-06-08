<script lang="ts">
  import { onMount } from 'svelte';
  import { apiGet, apiPost } from '$lib/api';
  import Icon from '@iconify/svelte';

  let loading = true;
  let error = '';
  let conflicts: any[] = [];
  let resolutionFilter = 'pending';
  let resolving: string | null = null;
  let resolveError = '';

  async function load() {
    loading = true;
    error = '';
    try {
      const resp = await apiGet<{ conflicts: any[] }>(
        `/sync/conflicts?resolution=${resolutionFilter}&limit=100`,
      );
      conflicts = resp.conflicts ?? [];
    } catch (e: any) {
      error = e.message || 'Failed to load conflicts';
    } finally {
      loading = false;
    }
  }

  onMount(load);

  async function resolve(id: string, decision: string) {
    resolving = id;
    resolveError = '';
    try {
      await apiPost(`/sync/conflicts/${id}/resolve`, { decision, resolvedBy: 'admin-ui' });
      await load();
    } catch (e: any) {
      resolveError = e.message || 'Resolve failed';
    } finally {
      resolving = null;
    }
  }
</script>

<svelte:head>
  <title>Sync Conflicts</title>
</svelte:head>

<div class="flex items-center justify-between mb-5">
  <h2 class="text-2xl uppercase">Sync Conflicts</h2>
  <a href="/sync" class="btn btn-xs btn-ghost">← Dashboard</a>
</div>

<div class="flex flex-wrap gap-3 mb-4">
  <select class="select select-bordered select-sm" bind:value={resolutionFilter} on:change={load}>
    <option value="pending">Pending</option>
    <option value="manual-resolved">Manual-resolved</option>
    <option value="auto-resolved">Auto-resolved</option>
    <option value="skip">Skipped</option>
  </select>
  <button class="btn btn-sm btn-outline" on:click={load}>
    <Icon icon="mdi:refresh" /> Refresh
  </button>
</div>

{#if resolveError}
  <div class="alert alert-error mb-4">
    <Icon icon="mdi:alert-circle-outline" />
    <span>{resolveError}</span>
  </div>
{/if}

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
              <th>Entity</th>
              <th>Resolution</th>
              <th>Resolved By</th>
              <th>Created</th>
              {#if resolutionFilter === 'pending'}
                <th>Actions</th>
              {/if}
            </tr>
          </thead>
          <tbody>
            {#if conflicts.length === 0}
              <tr><td colspan="7" class="text-center py-8 opacity-60">No {resolutionFilter} conflicts</td></tr>
            {:else}
              {#each conflicts as c}
                <tr>
                  <td class="font-mono text-xs">{c.id?.slice(0, 8)}…</td>
                  <td><span class="badge badge-outline badge-sm">{c.source}</span></td>
                  <td class="text-sm">{c.entity}</td>
                  <td>
                    <span class="badge badge-sm {c.resolution === 'pending' ? 'badge-warning' : 'badge-success'}">
                      {c.resolution}
                    </span>
                  </td>
                  <td class="text-xs opacity-70">{c.resolvedBy ?? '—'}</td>
                  <td class="text-xs opacity-70 whitespace-nowrap">
                    {new Date(c.createdAt ?? c.created_at).toLocaleString()}
                  </td>
                  {#if resolutionFilter === 'pending'}
                    <td class="flex gap-1">
                      <button
                        class="btn btn-xs btn-success"
                        disabled={resolving === c.id}
                        on:click={() => resolve(c.id, 'apply-source')}
                      >
                        {#if resolving === c.id}<span class="loading loading-xs"></span>{/if}
                        Source
                      </button>
                      <button
                        class="btn btn-xs btn-info"
                        disabled={resolving === c.id}
                        on:click={() => resolve(c.id, 'apply-target')}
                      >Target</button>
                      <button
                        class="btn btn-xs btn-ghost"
                        disabled={resolving === c.id}
                        on:click={() => resolve(c.id, 'skip')}
                      >Skip</button>
                    </td>
                  {/if}
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </div>
{/if}
