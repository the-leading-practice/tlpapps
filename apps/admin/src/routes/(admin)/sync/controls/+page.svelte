<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { apiFetch } from '$lib/api';
  import type { SyncControlRow } from './+page.js';
  import SyncCard from '$lib/components/Sync/SyncCard.svelte';
  import StatusPill from '$lib/components/Sync/StatusPill.svelte';
  import AllowlistCard from '$lib/components/Sync/AllowlistCard.svelte';
  import Icon from '@iconify/svelte';
  import { formatDateTime, formatTime } from '$lib/utils/stringUtils';

  export let data: { controls: SyncControlRow[] };

  let controls: SyncControlRow[] = data.controls ?? [];
  let saving: Record<string, boolean> = {};
  let error: string | null = null;
  let liveEvents: Record<string, any>[] = [];
  let eventSource: EventSource | null = null;

  const API_BASE = 'https://tlpapps.theleadingpractice.com/api';

  // ---------------------------------------------------------------------------
  // SSE feed for live sync activity
  // ---------------------------------------------------------------------------
  function connectSSE() {
    if (eventSource) return;
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('tlp_token') ?? '' : '';
    eventSource = new EventSource(`${API_BASE}/sync/activity/stream?token=${encodeURIComponent(token)}`);

    eventSource.addEventListener('snapshot', (e) => {
      try {
        const rows = JSON.parse(e.data);
        liveEvents = rows.slice(0, 20);
      } catch (_) {}
    });

    eventSource.addEventListener('update', (e) => {
      try {
        const rows = JSON.parse(e.data);
        liveEvents = [...rows, ...liveEvents].slice(0, 20);
      } catch (_) {}
    });

    eventSource.onerror = () => {
      // Browser handles reconnect automatically.
    };
  }

  async function loadControls() {
    try {
      const res = await apiFetch<{ controls: SyncControlRow[] }>('/sync/controls');
      controls = res.controls ?? [];
      error = null;
    } catch (err: any) {
      error = err?.message ?? 'Failed to load controls';
    }
  }

  onMount(() => {
    loadControls();
    connectSSE();
  });
  onDestroy(() => {
    eventSource?.close();
    eventSource = null;
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function rowKey(row: SyncControlRow) {
    return `${row.direction}:${row.entity}`;
  }

  const DIRECTION_LABELS: Record<string, string> = {
    drchrono_to_ghl: 'DrChrono → GHL',
    ghl_to_drchrono: 'GHL → DrChrono',
    drchrono_to_edge: 'DrChrono → Edge',
    edge_to_drchrono: 'Edge → DrChrono',
  };

  function directionLabel(d: string) {
    return DIRECTION_LABELS[d] ?? d;
  }

  function entityLabel(e: string) {
    return e.charAt(0).toUpperCase() + e.slice(1);
  }

  const MODES: Array<'off' | 'dry' | 'on'> = ['off', 'dry', 'on'];

  function modeButtonClass(row: SyncControlRow, m: 'off' | 'dry' | 'on'): string {
    const isActive = row.mode === m;
    const isDisabled = saving[rowKey(row)] ||
      (row.env_ceiling === 'off' && m !== 'off') ||
      (m === 'on' && row.env_ceiling !== 'on');
    if (isDisabled) return 'opacity-40 cursor-not-allowed';
    if (isActive) {
      if (m === 'on')  return 'bg-emerald-500/20 ring-1 ring-emerald-500/40 text-emerald-300 font-semibold';
      if (m === 'dry') return 'bg-amber-500/20 ring-1 ring-amber-500/40 text-amber-300 font-semibold';
      return 'bg-rose-500/20 ring-1 ring-rose-500/40 text-rose-300 font-semibold';
    }
    return 'text-base-content/50 hover:text-base-content/80 hover:bg-base-content/5';
  }

  async function updateMode(row: SyncControlRow, newMode: 'off' | 'dry' | 'on') {
    const key = rowKey(row);
    saving = { ...saving, [key]: true };
    error = null;
    try {
      const updated = await apiFetch<SyncControlRow>(
        `/sync/controls/${row.direction}/${row.entity}`,
        { method: 'PATCH', body: JSON.stringify({ mode: newMode }) },
      );
      controls = controls.map((r) =>
        r.direction === updated.direction && r.entity === updated.entity ? updated : r,
      );
    } catch (err: any) {
      error = err.message ?? 'Update failed';
    } finally {
      saving = { ...saving, [key]: false };
    }
  }

  function liveBadgeClass(status: string) {
    if (status === 'processed') return 'bg-emerald-500/15 ring-emerald-500/30 text-emerald-300';
    if (status === 'failed' || status === 'dead') return 'bg-rose-500/15 ring-rose-500/30 text-rose-300';
    return 'bg-amber-500/15 ring-amber-500/30 text-amber-300';
  }
</script>

<svelte:head>
  <title>Sync Controls — TLP Admin</title>
</svelte:head>

<div class="flex flex-col gap-6">

  <!-- Page header -->
  <div>
    <h2 class="text-xl font-semibold text-base-content">Sync Controls</h2>
    <p class="text-xs text-base-content/50 mt-1">
      Runtime toggles for the GHL / Edge ↔ DrChrono sync engine.
      Env ceiling is the max mode permitted by the server environment — effective mode is the lower of the two.
    </p>
  </div>

  {#if error}
    <div class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex items-center gap-3 text-sm text-rose-300">
      <Icon icon="mdi:alert-circle-outline" class="text-lg shrink-0" />
      <span>{error}</span>
    </div>
  {/if}

  <!-- Controls card -->
  <SyncCard title="Sync Mode Controls" padBody={false}>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-xs text-base-content/50 uppercase tracking-wide border-b border-base-content/10">
            <th class="text-left px-5 py-3 font-medium">Direction</th>
            <th class="text-left px-4 py-3 font-medium">Entity</th>
            <th class="text-left px-4 py-3 font-medium">DB Toggle</th>
            <th class="text-left px-4 py-3 font-medium">Env Ceiling</th>
            <th class="text-left px-4 py-3 font-medium">Effective</th>
            <th class="text-left px-4 py-3 font-medium">Updated By</th>
            <th class="text-left px-4 py-3 font-medium">Updated At</th>
            <th class="text-left px-4 py-3 font-medium">Change</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-base-content/5">
          {#each controls as row (rowKey(row))}
            {@const key = rowKey(row)}
            <tr class="hover:bg-base-content/5 transition-colors">
              <td class="px-5 py-3 text-sm font-medium">{directionLabel(row.direction)}</td>
              <td class="px-4 py-3">{entityLabel(row.entity)}</td>
              <td class="px-4 py-3"><StatusPill status={row.mode} variant="mode" /></td>
              <td class="px-4 py-3"><StatusPill status={row.env_ceiling} variant="mode" /></td>
              <td class="px-4 py-3"><StatusPill status={row.effective_mode} variant="mode" /></td>
              <td class="px-4 py-3 text-xs text-base-content/60">{row.updatedBy ?? row.updated_by ?? '—'}</td>
              <td class="px-4 py-3 text-xs text-base-content/50 whitespace-nowrap">{formatDateTime(row.updatedAt ?? row.updated_at)}</td>
              <td class="px-4 py-3">
                <!-- Segmented mode picker -->
                <div class="inline-flex rounded-lg border border-base-content/15 overflow-hidden text-xs">
                  {#each MODES as m}
                    {@const isDisabled = saving[key] ||
                      (row.env_ceiling === 'off' && m !== 'off') ||
                      (m === 'on' && row.env_ceiling !== 'on')}
                    <button
                      class="px-3 py-1.5 transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 {modeButtonClass(row, m)}"
                      disabled={isDisabled}
                      aria-label="Set {row.entity} {directionLabel(row.direction)} mode to {m}"
                      aria-pressed={row.mode === m}
                      on:click={() => updateMode(row, m)}
                    >
                      {m}
                    </button>
                  {/each}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </SyncCard>

  <!-- Location allowlist (read-only) -->
  <AllowlistCard />

  <!-- Live SSE activity feed -->
  <SyncCard title="Live Sync Activity" padBody={false}>
    <svelte:fragment slot="action">
      <span class="flex items-center gap-1.5 text-xs text-base-content/40">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
        Live
      </span>
    </svelte:fragment>

    {#if liveEvents.length === 0}
      <div class="flex flex-col items-center justify-center py-10 gap-2 text-base-content/40">
        <Icon icon="mdi:radio-tower" class="text-2xl" />
        <span class="text-sm">Waiting for events…</span>
      </div>
    {:else}
      <div class="overflow-x-auto max-h-72 overflow-y-auto">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-base-200 z-10">
            <tr class="text-xs text-base-content/50 uppercase tracking-wide border-b border-base-content/10">
              <th class="text-left px-5 py-2.5 font-medium">Time</th>
              <th class="text-left px-4 py-2.5 font-medium">Source</th>
              <th class="text-left px-4 py-2.5 font-medium">Action</th>
              <th class="text-left px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-base-content/5">
            {#each liveEvents as ev}
              <tr class="hover:bg-base-content/5 transition-colors">
                <td class="px-5 py-2 font-mono text-xs text-base-content/60 whitespace-nowrap">
                  {formatTime(ev['received_at'] ?? ev['receivedAt'] ?? Date.now())}
                </td>
                <td class="px-4 py-2">
                  <span class="inline-flex px-1.5 py-0.5 rounded text-xs border border-base-content/20 text-base-content/70 font-mono">
                    {ev['source'] ?? '—'}
                  </span>
                </td>
                <td class="px-4 py-2 text-xs">{ev['action'] ?? '—'}</td>
                <td class="px-4 py-2">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 {liveBadgeClass(ev['status'] ?? '')}">
                    {ev['status'] ?? '—'}
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </SyncCard>

</div>
