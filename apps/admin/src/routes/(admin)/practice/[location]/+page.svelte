<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { apiGet, apiPut } from '$lib/api';
  import { addToast } from '$lib/components/Toast';
  import type { Practice } from '$lib/types/common';
  import { formatDateTime } from '$lib/utils/stringUtils';
  import Icon from '@iconify/svelte';

  let loading = true;
  let saving = false;
  let error = '';

  let practice: Practice = {
    name: '',
    location: '',
    software: '',
    calendarId: '',
    timezone: '',
    pushGhl: false,
    pushAppointments: false,
    pushPatients: false,
  };

  const softwareOptions = ['ChiroTouch', 'Embodi', 'DrChrono', 'SilkOne', 'Other'];
  const timezoneOptions = [
    'America/New_York',
    'America/Chicago',
    'US/Central',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Anchorage',
    'Pacific/Honolulu',
  ];

  onMount(async () => {
    const location = $page.params.location;
    try {
      practice = await apiGet<Practice>(`/admin/practices/${location}`);
    } catch (e: any) {
      error = e.message || 'Failed to load practice';
    } finally {
      loading = false;
    }
  });

  async function savePractice() {
    saving = true;
    try {
      await apiPut(`/admin/practices/${practice.location}`, practice);
      addToast({ type: 'success', message: 'Practice updated successfully', dismissible: true, timeout: 3000 });
    } catch (e: any) {
      addToast({ type: 'error', message: e.message || 'Failed to save practice', dismissible: true, timeout: 5000 });
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>{practice.name || 'Practice Detail'}</title>
</svelte:head>

<div class="flex justify-between items-center mb-5">
  <div class="flex items-center gap-3">
    <button class="btn btn-ghost btn-sm" on:click={() => goto('/practice')}>
      <Icon icon="mdi:arrow-left" class="text-lg" />
    </button>
    <h2 class="text-2xl uppercase">Edit Practice</h2>
  </div>
  <a href="/practice/config/{practice.location}" class="btn btn-outline btn-sm">
    <Icon icon="mdi:application-cog-outline" />
    Client Config
  </a>
</div>

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
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Practice Form -->
    <div class="lg:col-span-2">
      <div class="card bg-base-200 shadow-lg">
        <div class="card-body">
          <h3 class="card-title text-lg mb-4">Practice Details</h3>
          <form on:submit|preventDefault={savePractice}>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Name -->
              <div class="form-control md:col-span-2">
                <label class="label" for="name">
                  <span class="label-text">Practice Name</span>
                </label>
                <input
                  id="name"
                  type="text"
                  class="input input-bordered w-full"
                  bind:value={practice.name}
                  required
                />
              </div>

              <!-- Software -->
              <div class="form-control">
                <label class="label" for="software">
                  <span class="label-text">Software</span>
                </label>
                <select id="software" class="select select-bordered w-full" bind:value={practice.software}>
                  <option value="" disabled>Select software</option>
                  {#each softwareOptions as sw}
                    <option value={sw}>{sw}</option>
                  {/each}
                </select>
              </div>

              <!-- Calendar ID -->
              <div class="form-control">
                <label class="label" for="calendarId">
                  <span class="label-text">Calendar ID</span>
                </label>
                <input
                  id="calendarId"
                  type="text"
                  class="input input-bordered w-full"
                  bind:value={practice.calendarId}
                />
              </div>

              <!-- Timezone -->
              <div class="form-control">
                <label class="label" for="timezone">
                  <span class="label-text">Timezone</span>
                </label>
                <select id="timezone" class="select select-bordered w-full" bind:value={practice.timezone}>
                  <option value="" disabled>Select timezone</option>
                  {#each timezoneOptions as tz}
                    <option value={tz}>{tz}</option>
                  {/each}
                </select>
              </div>

              <!-- Location ID (read-only) -->
              <div class="form-control">
                <label class="label" for="location">
                  <span class="label-text">Location ID</span>
                </label>
                <input
                  id="location"
                  type="text"
                  class="input input-bordered w-full opacity-60"
                  value={practice.location}
                  disabled
                />
              </div>
            </div>

            <!-- Push Toggles -->
            <div class="divider">Push Settings</div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="form-control">
                <label class="label cursor-pointer justify-start gap-3">
                  <input type="checkbox" class="toggle toggle-primary" bind:checked={practice.pushGhl} />
                  <span class="label-text">Push to GHL</span>
                </label>
              </div>
              <div class="form-control">
                <label class="label cursor-pointer justify-start gap-3">
                  <input type="checkbox" class="toggle toggle-secondary" bind:checked={practice.pushAppointments} />
                  <span class="label-text">Push Appointments</span>
                </label>
              </div>
              <div class="form-control">
                <label class="label cursor-pointer justify-start gap-3">
                  <input type="checkbox" class="toggle toggle-accent" bind:checked={practice.pushPatients} />
                  <span class="label-text">Push Patients</span>
                </label>
              </div>
            </div>

            <div class="card-actions justify-end mt-6">
              <a href="/practice" class="btn">Cancel</a>
              <button type="submit" class="btn btn-primary" disabled={saving}>
                {#if saving}
                  <span class="loading loading-spinner loading-sm"></span>
                {/if}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Stats Sidebar -->
    <div class="space-y-4">
      <div class="card bg-base-200 shadow-lg">
        <div class="card-body">
          <h3 class="card-title text-lg">Statistics</h3>
          <div class="stats stats-vertical shadow">
            <div class="stat">
              <div class="stat-title">Patients</div>
              <div class="stat-value text-primary">{practice.patientCount ?? 0}</div>
            </div>
            <div class="stat">
              <div class="stat-title">Appointments</div>
              <div class="stat-value text-secondary">{practice.appointmentCount ?? 0}</div>
            </div>
            <div class="stat">
              <div class="stat-title">Last Sync</div>
              <div class="stat-desc text-base">
                {formatDateTime(practice.lastSync, 'Never synced')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
