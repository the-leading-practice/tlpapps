<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { apiFetch } from '$lib/api';
  import type { SyncControlRow } from './+page.js';

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
    // EventSource doesn't support custom headers; pass token as query param
    // (backend reads Authorization or ?token= — adjust if needed)
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
      // Reconnect is handled automatically by the browser; no action needed.
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
  // Controls table helpers
  // ---------------------------------------------------------------------------

  function rowKey(row: SyncControlRow) {
    return `${row.direction}:${row.entity}`;
  }

  function directionLabel(d: string) {
    return d === 'drchrono_to_ghl' ? 'DrChrono → GHL' : 'GHL → DrChrono';
  }

  function entityLabel(e: string) {
    return e.charAt(0).toUpperCase() + e.slice(1);
  }

  function modeBadge(mode: string) {
    if (mode === 'on') return 'badge badge-success';
    if (mode === 'dry') return 'badge badge-warning';
    return 'badge badge-error';
  }

  const MODES: Array<'off' | 'dry' | 'on'> = ['off', 'dry', 'on'];

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
</script>

<svelte:head>
  <title>Sync Controls — TLP Admin</title>
</svelte:head>

<div class="flex flex-col gap-6">
  <div>
    <h1 class="text-2xl font-bold">Sync Controls</h1>
    <p class="text-sm text-base-content/60 mt-1">
      Runtime toggles for the GHL ↔ DrChrono sync engine. Env ceiling is the max mode allowed
      by the server environment variable — the effective mode is the lower of the two.
    </p>
  </div>

  {#if error}
    <div class="alert alert-error">
      <span>{error}</span>
    </div>
  {/if}

  <!-- Controls table -->
  <div class="overflow-x-auto rounded-lg border border-base-300">
    <table class="table table-zebra w-full">
      <thead>
        <tr>
          <th>Direction</th>
          <th>Entity</th>
          <th>DB Toggle</th>
          <th>Env Ceiling</th>
          <th>Effective</th>
          <th>Updated By</th>
          <th>Updated At</th>
          <th>Change</th>
        </tr>
      </thead>
      <tbody>
        {#each controls as row (rowKey(row))}
          {@const key = rowKey(row)}
          <tr>
            <td>{directionLabel(row.direction)}</td>
            <td>{entityLabel(row.entity)}</td>
            <td><span class={modeBadge(row.mode)}>{row.mode}</span></td>
            <td><span class={modeBadge(row.env_ceiling)}>{row.env_ceiling}</span></td>
            <td><span class={modeBadge(row.effective_mode)}>{row.effective_mode}</span></td>
            <td class="text-sm">{row.updated_by ?? '—'}</td>
            <td class="text-sm">{new Date(row.updated_at).toLocaleString()}</td>
            <td>
              <div class="join">
                {#each MODES as m}
                  <button
                    class="btn btn-xs join-item {row.mode === m ? 'btn-active' : 'btn-ghost'}"
                    disabled={saving[key] || row.env_ceiling === 'off' && m !== 'off' || (m === 'on' && row.env_ceiling !== 'on')}
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

  <!-- Live SSE activity feed -->
  <div>
    <h2 class="text-lg font-semibold mb-2">Live Sync Activity</h2>
    {#if liveEvents.length === 0}
      <p class="text-sm text-base-content/50">Waiting for events…</p>
    {:else}
      <div class="overflow-x-auto rounded-lg border border-base-300 max-h-72 overflow-y-auto">
        <table class="table table-xs w-full">
          <thead>
            <tr>
              <th>Time</th>
              <th>Source</th>
              <th>Action</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each liveEvents as ev}
              <tr>
                <td class="text-xs">{new Date(ev['received_at'] ?? ev['receivedAt'] ?? Date.now()).toLocaleTimeString()}</td>
                <td>{ev['source'] ?? '—'}</td>
                <td>{ev['action'] ?? '—'}</td>
                <td><span class="badge badge-xs {ev['status'] === 'processed' ? 'badge-success' : ev['status'] === 'failed' || ev['status'] === 'dead' ? 'badge-error' : 'badge-warning'}">{ev['status'] ?? '—'}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
