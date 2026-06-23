<script lang="ts">
  import { onMount } from 'svelte';
  import { apiGet, apiPost } from '$lib/api';
  import Icon from '@iconify/svelte';
  import SyncCard from '$lib/components/Sync/SyncCard.svelte';
  import StatusPill from '$lib/components/Sync/StatusPill.svelte';
  import { formatDateTime } from '$lib/utils/stringUtils';

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

<div class="flex flex-col gap-5">

  <div class="flex items-center justify-between">
    <h2 class="text-xl font-semibold text-base-content">Sync Conflicts</h2>
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-2">
    <select
      class="select select-sm bg-base-200 border border-base-content/15 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
      bind:value={resolutionFilter}
      on:change={load}
    >
      <option value="pending">Pending</option>
      <option value="manual-resolved">Manual-resolved</option>
      <option value="auto-resolved">Auto-resolved</option>
      <option value="skip">Skipped</option>
    </select>
    <button
      class="btn btn-sm bg-base-200 border border-base-content/15 hover:bg-base-content/10 rounded-lg flex items-center gap-1.5 text-sm"
      on:click={load}
      aria-label="Refresh conflicts"
    >
      <Icon icon="mdi:refresh" class="text-base" />
      Refresh
    </button>
  </div>

  {#if resolveError}
    <div class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex items-center gap-3 text-sm text-rose-300">
      <Icon icon="mdi:alert-circle-outline" class="text-lg shrink-0" />
      <span>{resolveError}</span>
    </div>
  {/if}

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
              <th class="text-left px-4 py-3 font-medium">Entity</th>
              <th class="text-left px-4 py-3 font-medium">Resolution</th>
              <th class="text-left px-4 py-3 font-medium">Resolved By</th>
              <th class="text-left px-4 py-3 font-medium">Created</th>
              {#if resolutionFilter === 'pending'}
                <th class="text-left px-4 py-3 font-medium">Actions</th>
              {/if}
            </tr>
          </thead>
          <tbody class="divide-y divide-base-content/5">
            {#if conflicts.length === 0}
              <tr>
                <td colspan="7" class="py-12 text-center text-base-content/40 text-sm">
                  No {resolutionFilter} conflicts
                </td>
              </tr>
            {:else}
              {#each conflicts as c}
                <tr class="hover:bg-base-content/5 transition-colors">
                  <td class="px-5 py-2.5 font-mono text-xs text-base-content/60">{c.id?.slice(0, 8)}…</td>
                  <td class="px-4 py-2.5">
                    <span class="inline-flex px-1.5 py-0.5 rounded text-xs border border-base-content/20 text-base-content/70 font-mono">{c.source}</span>
                  </td>
                  <td class="px-4 py-2.5 text-sm">{c.entity}</td>
                  <td class="px-4 py-2.5">
                    <StatusPill
                      status={c.resolution}
                      variant={c.resolution === 'pending' ? 'mode' : 'status'}
                    />
                  </td>
                  <td class="px-4 py-2.5 text-xs text-base-content/50">{c.resolvedBy ?? '—'}</td>
                  <td class="px-4 py-2.5 text-xs text-base-content/50 whitespace-nowrap">
                    {formatDateTime(c.createdAt ?? c.created_at)}
                  </td>
                  {#if resolutionFilter === 'pending'}
                    <td class="px-4 py-2.5">
                      <div class="flex items-center gap-1.5">
                        <button
                          class="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/15 ring-1 ring-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
                          disabled={resolving === c.id}
                          on:click={() => resolve(c.id, 'apply-source')}
                          aria-label="Apply source for conflict {c.id}"
                        >
                          {#if resolving === c.id}<span class="loading loading-xs mr-1"></span>{/if}
                          Source
                        </button>
                        <button
                          class="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/15 ring-1 ring-blue-500/30 text-blue-300 hover:bg-blue-500/25 transition-colors disabled:opacity-40"
                          disabled={resolving === c.id}
                          on:click={() => resolve(c.id, 'apply-target')}
                          aria-label="Apply target for conflict {c.id}"
                        >Target</button>
                        <button
                          class="px-2.5 py-1 rounded-lg text-xs font-medium bg-base-content/10 ring-1 ring-base-content/20 text-base-content/60 hover:bg-base-content/15 transition-colors disabled:opacity-40"
                          disabled={resolving === c.id}
                          on:click={() => resolve(c.id, 'skip')}
                          aria-label="Skip conflict {c.id}"
                        >Skip</button>
                      </div>
                    </td>
                  {/if}
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </SyncCard>
  {/if}

</div>
