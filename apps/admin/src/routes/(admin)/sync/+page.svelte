<script lang="ts">
  import { onMount } from 'svelte';
  import { apiGet } from '$lib/api';
  import Icon from '@iconify/svelte';
  import SyncStatCard from '$lib/components/Sync/SyncStatCard.svelte';
  import SyncCard from '$lib/components/Sync/SyncCard.svelte';
  import StatusPill from '$lib/components/Sync/StatusPill.svelte';

  type DirectionVals = { attempted: number; succeeded: number; failed: number };

  let loading = true;
  let error = '';
  let metrics: Record<string, any> = {};
  let recentEvents: any[] = [];

  $: perDirectionEntries = metrics.per_direction
    ? (Object.entries(metrics.per_direction) as [string, DirectionVals][])
    : ([] as [string, DirectionVals][]);

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

  function statTone(key: string, val: number): 'neutral' | 'success' | 'warning' | 'error' {
    if (key === 'sync_writes_succeeded') return 'success';
    if (key === 'sync_writes_failed' || key === 'sync_dead_letter_count') return val > 0 ? 'error' : 'neutral';
    if (key === 'sync_conflict_queue_size') return val > 50 ? 'error' : val > 0 ? 'warning' : 'neutral';
    if (key === 'patients_dual_write_pg_fail') return val > 0 ? 'warning' : 'neutral';
    return 'neutral';
  }
</script>

<svelte:head>
  <title>Sync Dashboard</title>
</svelte:head>

<div class="flex items-center justify-between mb-6">
  <h2 class="text-xl font-semibold text-base-content">Sync Dashboard</h2>
</div>

{#if loading}
  <div class="flex justify-center py-16">
    <span class="loading loading-spinner loading-lg text-blue-400"></span>
  </div>
{:else if error}
  <div class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex items-center gap-3 text-sm text-rose-300 mb-6">
    <Icon icon="mdi:alert-circle-outline" class="text-lg shrink-0" />
    <span>{error}</span>
  </div>
{:else}
  <!-- KPI grid -->
  <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
    {#each [
      { label: 'Attempted',       key: 'sync_writes_attempted',      icon: 'mdi:sync' },
      { label: 'Succeeded',       key: 'sync_writes_succeeded',      icon: 'mdi:check-circle-outline' },
      { label: 'Failed',          key: 'sync_writes_failed',         icon: 'mdi:close-circle-outline' },
      { label: 'Skipped (off)',   key: 'sync_writes_skipped_off',    icon: 'mdi:minus-circle-outline' },
      { label: 'Skipped (loop)',  key: 'sync_writes_skipped_loop',   icon: 'mdi:loop' },
      { label: 'Dry-run actions', key: 'sync_dry_run_actions',       icon: 'mdi:test-tube-outline' },
      { label: 'Dead-letter',     key: 'sync_dead_letter_count',     icon: 'mdi:email-alert-outline' },
      { label: 'Conflicts',       key: 'sync_conflict_queue_size',   icon: 'mdi:alert-outline' },
      { label: 'Patient PG fails',key: 'patients_dual_write_pg_fail',icon: 'mdi:database-alert-outline' },
    ] as c}
      {@const val = metrics[c.key] ?? 0}
      <SyncStatCard
        label={c.label}
        value={val}
        icon={c.icon}
        tone={statTone(c.key, val)}
      />
    {/each}
  </div>

  <!-- Per-direction breakdown -->
  {#if perDirectionEntries.length > 0}
    <div class="mb-6">
      <SyncCard title="Per-Direction Writes">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-xs text-base-content/50 uppercase tracking-wide border-b border-base-content/10">
                <th class="text-left py-2 pr-4 font-medium">Direction</th>
                <th class="text-right py-2 px-4 font-medium">Attempted</th>
                <th class="text-right py-2 px-4 font-medium">Succeeded</th>
                <th class="text-right py-2 pl-4 font-medium">Failed</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-base-content/5">
              {#each perDirectionEntries as [dir, vals]}
                <tr class="hover:bg-base-content/5 transition-colors">
                  <td class="font-mono text-xs py-2.5 pr-4">{dir.replace(/_/g, ' → ')}</td>
                  <td class="text-right py-2.5 px-4 tabular-nums">{vals.attempted}</td>
                  <td class="text-right py-2.5 px-4 tabular-nums text-emerald-400">{vals.succeeded}</td>
                  <td class="text-right py-2.5 pl-4 tabular-nums {vals.failed > 0 ? 'text-rose-400' : ''}">{vals.failed}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </SyncCard>
    </div>
  {/if}

  <!-- Recent events -->
  <SyncCard title="Recent Events">
    <svelte:fragment slot="action">
      <a href="/sync/events" class="text-xs text-blue-400 hover:text-blue-300 transition-colors">View all →</a>
    </svelte:fragment>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-xs text-base-content/50 uppercase tracking-wide border-b border-base-content/10">
            <th class="text-left py-2 pr-4 font-medium">ID</th>
            <th class="text-left py-2 px-4 font-medium">Source</th>
            <th class="text-left py-2 px-4 font-medium">Action</th>
            <th class="text-left py-2 px-4 font-medium">Status</th>
            <th class="text-left py-2 pl-4 font-medium">Received</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-base-content/5">
          {#if recentEvents.length === 0}
            <tr>
              <td colspan="5" class="py-10 text-center text-base-content/40 text-sm">
                No events yet
              </td>
            </tr>
          {:else}
            {#each recentEvents as ev}
              <tr class="hover:bg-base-content/5 transition-colors">
                <td class="font-mono text-xs py-2.5 pr-4 text-base-content/60">{ev.id?.slice(0, 8)}…</td>
                <td class="py-2.5 px-4">
                  <span class="inline-flex px-1.5 py-0.5 rounded text-xs border border-base-content/20 text-base-content/70 font-mono">{ev.source}</span>
                </td>
                <td class="py-2.5 px-4 text-sm">{ev.action}</td>
                <td class="py-2.5 px-4"><StatusPill status={ev.status} /></td>
                <td class="py-2.5 pl-4 text-xs text-base-content/50 whitespace-nowrap">{new Date(ev.receivedAt).toLocaleString()}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </SyncCard>
{/if}
