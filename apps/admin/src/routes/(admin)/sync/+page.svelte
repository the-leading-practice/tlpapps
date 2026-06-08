<script lang="ts">
  import { onMount } from 'svelte';
  import { apiGet } from '$lib/api';
  import Icon from '@iconify/svelte';

  let loading = true;
  let error = '';
  let metrics: Record<string, any> = {};
  let recentEvents: any[] = [];

  onMount(async () => {
    try {
      const [m, evResp] = await Promise.all([
        apiGet<Record<string, any>>('/sync/metrics'),
        apiGet<{ events: any[] }>('/sync/events?limit=10'),
      ]);
      metrics = m;
      recentEvents = evResp.events ?? [];
    } catch (e: any) {
      error = e.message || 'Failed to load sync dashboard';
    } finally {
      loading = false;
    }
  });

  function badge(status: string) {
    if (status === 'processed') return 'badge-success';
    if (status === 'pending') return 'badge-warning';
    if (status === 'failed' || status === 'dead') return 'badge-error';
    return 'badge-ghost';
  }
</script>

<svelte:head>
  <title>Sync Dashboard</title>
</svelte:head>

<h2 class="text-2xl uppercase mb-5">Sync Dashboard</h2>

{#if loading}
  <div class="flex justify-center py-12">
    <span class="loading loading-spinner loading-lg"></span>
  </div>
{:else if error}
  <div class="alert alert-error mb-4">
    <Icon icon="mdi:alert-circle-outline" class="text-xl" />
    <span>{error}</span>
  </div>
{:else}
  <!-- Counters grid -->
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
    {#each [
      { label: 'Attempted', key: 'sync_writes_attempted', icon: 'mdi:sync', color: 'bg-base-200' },
      { label: 'Succeeded', key: 'sync_writes_succeeded', icon: 'mdi:check-circle-outline', color: 'bg-success/10' },
      { label: 'Failed', key: 'sync_writes_failed', icon: 'mdi:close-circle-outline', color: 'bg-error/10' },
      { label: 'Skipped (off)', key: 'sync_writes_skipped_off', icon: 'mdi:minus-circle-outline', color: 'bg-base-200' },
      { label: 'Skipped (loop)', key: 'sync_writes_skipped_loop', icon: 'mdi:loop', color: 'bg-base-200' },
      { label: 'Dry-run actions', key: 'sync_dry_run_actions', icon: 'mdi:test-tube-outline', color: 'bg-base-200' },
      { label: 'Dead-letter queue', key: 'sync_dead_letter_count', icon: 'mdi:email-alert-outline', color: metrics['sync_dead_letter_count'] > 0 ? 'bg-error/10' : 'bg-base-200' },
      { label: 'Conflict queue', key: 'sync_conflict_queue_size', icon: 'mdi:alert-outline', color: metrics['sync_conflict_queue_size'] > 50 ? 'bg-error/10' : metrics['sync_conflict_queue_size'] > 0 ? 'bg-warning/10' : 'bg-base-200' },
      { label: 'Patient PG fails', key: 'patients_dual_write_pg_fail', icon: 'mdi:database-alert-outline', color: metrics['patients_dual_write_pg_fail'] > 0 ? 'bg-warning/10' : 'bg-base-200' },
    ] as c}
      <div class="card shadow {c.color}">
        <div class="card-body p-4">
          <div class="flex items-center gap-2 mb-1">
            <Icon icon={c.icon} class="text-lg opacity-70" />
            <span class="text-xs uppercase opacity-60">{c.label}</span>
          </div>
          <div class="text-3xl font-bold">{metrics[c.key] ?? 0}</div>
        </div>
      </div>
    {/each}
  </div>

  <!-- Per-direction breakdown -->
  {#if metrics.per_direction}
    <div class="card bg-base-200 shadow-lg mb-8">
      <div class="card-body">
        <h3 class="card-title text-lg">Per-Direction Writes</h3>
        <div class="overflow-x-auto">
          <table class="table table-zebra">
            <thead>
              <tr>
                <th>Direction</th>
                <th>Attempted</th>
                <th>Succeeded</th>
                <th>Failed</th>
              </tr>
            </thead>
            <tbody>
              {#each Object.entries(metrics.per_direction) as [dir, vals]}
                <tr>
                  <td class="font-mono text-sm">{dir.replace(/_/g, ' → ')}</td>
                  <td>{(vals as any).attempted}</td>
                  <td>{(vals as any).succeeded}</td>
                  <td>{(vals as any).failed}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  {/if}

  <!-- Recent events -->
  <div class="card bg-base-200 shadow-lg">
    <div class="card-body">
      <div class="flex justify-between items-center mb-2">
        <h3 class="card-title text-lg">Recent Events</h3>
        <a href="/sync/events" class="btn btn-xs btn-outline">View All</a>
      </div>
      <div class="overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>ID</th>
              <th>Source</th>
              <th>Action</th>
              <th>Status</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {#if recentEvents.length === 0}
              <tr><td colspan="5" class="text-center py-6 opacity-60">No events</td></tr>
            {:else}
              {#each recentEvents as ev}
                <tr>
                  <td class="font-mono text-xs">{ev.id?.slice(0, 8)}…</td>
                  <td><span class="badge badge-outline badge-sm">{ev.source}</span></td>
                  <td class="text-sm">{ev.action}</td>
                  <td><span class="badge badge-sm {badge(ev.status)}">{ev.status}</span></td>
                  <td class="text-xs opacity-70">{new Date(ev.receivedAt).toLocaleString()}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </div>
{/if}
