<script lang="ts">
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api';
  import SyncCard from '$lib/components/Sync/SyncCard.svelte';
  import Icon from '@iconify/svelte';
  import type {
    CalendarMapResponse,
    ProfileRow,
    CalendarRow,
    LocationOption,
  } from './+page.js';

  let locations: LocationOption[] = [];
  let location = ''; // selected ghlLocationId

  let profiles: ProfileRow[] = [];
  let calendars: CalendarRow[] = [];
  let assignments: Record<string, string> = {}; // profileId(string) → calendarId

  let loadingLocations = true;
  let loading = false;
  let saving = false;
  let error: string | null = null;
  let stale = false; // profiles served from cache (DrChrono unreachable)
  let toast: { kind: 'ok' | 'err'; msg: string } | null = null;

  function flash(kind: 'ok' | 'err', msg: string) {
    toast = { kind, msg };
    setTimeout(() => (toast = null), 3500);
  }

  async function loadLocations() {
    loadingLocations = true;
    try {
      locations = await apiFetch<LocationOption[]>('/sync/locations');
      // Auto-select the first location so the page lands ready-to-use.
      if (!location && locations.length > 0) {
        location = locations[0].ghlLocationId;
        await loadMap();
      }
    } catch (err: any) {
      error = err?.message ?? 'Failed to load locations';
    } finally {
      loadingLocations = false;
    }
  }

  async function loadMap() {
    const loc = location.trim();
    if (!loc) {
      error = 'Select a location.';
      return;
    }
    loading = true;
    error = null;
    stale = false;
    try {
      const res = await apiFetch<CalendarMapResponse>(
        `/sync/calendar-map?location=${encodeURIComponent(loc)}`,
      );
      profiles = res.profiles ?? [];
      calendars = res.calendars ?? [];
      stale = res.profilesStale === true;
      const map = res.profileCalendarMap ?? {};
      // Seed assignments for every profile (blank = unmapped).
      const next: Record<string, string> = {};
      for (const p of profiles) next[String(p.id)] = map[String(p.id)] ?? '';
      assignments = next;
    } catch (err: any) {
      error = err?.message ?? 'Failed to load calendar map';
      profiles = [];
      calendars = [];
      assignments = {};
    } finally {
      loading = false;
    }
  }

  // Re-load whenever the selected location changes via the dropdown.
  function onLocationChange() {
    loadMap();
  }

  async function save() {
    saving = true;
    error = null;
    try {
      // Only send non-empty selections; the backend treats missing as unmapped.
      const profileCalendarMap: Record<string, string> = {};
      for (const [pid, cid] of Object.entries(assignments)) {
        if (cid) profileCalendarMap[pid] = cid;
      }
      const res = await apiFetch<{ profileCalendarMap: Record<string, string> }>(
        '/sync/calendar-map',
        { method: 'PUT', body: JSON.stringify({ location: location.trim(), profileCalendarMap }) },
      );
      const saved = res.profileCalendarMap ?? {};
      const next: Record<string, string> = {};
      for (const p of profiles) next[String(p.id)] = saved[String(p.id)] ?? '';
      assignments = next;
      flash('ok', 'Calendar mapping saved.');
    } catch (err: any) {
      const msg = err?.message ?? 'Save failed';
      error = msg;
      flash('err', msg);
    } finally {
      saving = false;
    }
  }

  function calLabel(c: CalendarRow): string {
    return c.isActive === false ? `${c.name} (inactive)` : c.name;
  }

  onMount(loadLocations);
</script>

<svelte:head>
  <title>Calendar Mapping — TLP Admin</title>
</svelte:head>

<div class="flex flex-col gap-6">

  <!-- Page header -->
  <div>
    <h2 class="text-xl font-semibold text-base-content">Calendar Mapping</h2>
    <p class="text-xs text-base-content/50 mt-1">
      Map each DrChrono appointment profile to a GHL calendar for a practice.
      The sync engine routes each appointment to its profile's mapped calendar
      (falling back to the location default when unmapped).
    </p>
  </div>

  <!-- Location selector -->
  <div class="flex flex-wrap items-end gap-3">
    <label class="flex flex-col gap-1">
      <span class="text-xs text-base-content/50">Practice</span>
      <select
        class="select select-bordered select-sm w-72"
        bind:value={location}
        on:change={onLocationChange}
        disabled={loadingLocations || locations.length === 0}
      >
        {#if loadingLocations}
          <option value="">Loading locations…</option>
        {:else if locations.length === 0}
          <option value="">No locations configured</option>
        {:else}
          {#each locations as l (l.ghlLocationId)}
            <option value={l.ghlLocationId}>{l.name}</option>
          {/each}
        {/if}
      </select>
    </label>
    <button class="btn btn-sm" on:click={loadMap} disabled={loading || !location}>
      <Icon icon="mdi:refresh" class="text-base {loading ? 'animate-spin' : ''}" />
      Refresh
    </button>
  </div>

  {#if stale}
    <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center gap-3 text-sm text-amber-300">
      <Icon icon="mdi:information-outline" class="text-lg shrink-0" />
      <span>Showing cached profiles — DrChrono was unreachable. Mapping still saves normally.</span>
    </div>
  {/if}

  {#if toast}
    <div
      class="rounded-xl border px-4 py-3 flex items-center gap-3 text-sm
        {toast.kind === 'ok'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}"
    >
      <Icon icon={toast.kind === 'ok' ? 'mdi:check-circle-outline' : 'mdi:alert-circle-outline'} class="text-lg shrink-0" />
      <span>{toast.msg}</span>
    </div>
  {/if}

  {#if error && !toast}
    <div class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex items-center gap-3 text-sm text-rose-300">
      <Icon icon="mdi:alert-circle-outline" class="text-lg shrink-0" />
      <span>{error}</span>
    </div>
  {/if}

  <SyncCard>
    {#if loading}
      <div class="flex flex-col items-center justify-center py-12 gap-2 text-base-content/40">
        <Icon icon="mdi:loading" class="text-2xl animate-spin" />
        <span class="text-sm">Loading profiles &amp; calendars…</span>
      </div>
    {:else if profiles.length === 0}
      <div class="flex flex-col items-center justify-center py-12 gap-2 text-base-content/40">
        <Icon icon="mdi:calendar-blank-outline" class="text-2xl" />
        <span class="text-sm">No appointment profiles for this location.</span>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-xs text-base-content/50 uppercase tracking-wide border-b border-base-content/10">
              <th class="text-left px-5 py-2.5 font-medium">EHR Appointment Profile</th>
              <th class="text-left px-4 py-2.5 font-medium">GHL Calendar</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-base-content/5">
            {#each profiles as p (p.id)}
              <tr class="hover:bg-base-content/5 transition-colors">
                <td class="px-5 py-2.5">
                  <div class="flex items-center gap-2">
                    {#if p.color}
                      <span class="inline-block w-3 h-3 rounded-full shrink-0" style="background:{p.color}"></span>
                    {/if}
                    <span class="text-base-content">{p.name}</span>
                    {#if p.duration != null}
                      <span class="text-xs text-base-content/40">· {p.duration} min</span>
                    {/if}
                  </div>
                </td>
                <td class="px-4 py-2.5">
                  <select
                    class="select select-bordered select-sm w-72"
                    bind:value={assignments[String(p.id)]}
                  >
                    <option value="">— Unmapped (use default) —</option>
                    {#each calendars as c (c.id)}
                      <option value={c.id}>{calLabel(c)}</option>
                    {/each}
                  </select>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="flex justify-end px-5 py-4 border-t border-base-content/10">
        <button class="btn btn-primary btn-sm" on:click={save} disabled={saving}>
          {#if saving}
            <Icon icon="mdi:loading" class="text-base animate-spin" />
            Saving…
          {:else}
            <Icon icon="mdi:content-save-outline" class="text-base" />
            Save Mapping
          {/if}
        </button>
      </div>
    {/if}
  </SyncCard>

</div>
