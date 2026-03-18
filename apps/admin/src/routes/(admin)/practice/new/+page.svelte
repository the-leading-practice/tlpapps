<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiPost } from '$lib/api';
  import { addToast } from '$lib/components/Toast';
  import type { Practice } from '$lib/types/common';
  import Icon from '@iconify/svelte';

  let saving = false;

  let practice: Practice = {
    name: '',
    location: '',
    software: '',
    calendarId: '',
    timezone: 'America/New_York',
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

  async function createPractice() {
    if (!practice.name.trim() || !practice.location.trim()) {
      addToast({ type: 'error', message: 'Name and Location ID are required', dismissible: true, timeout: 3000 });
      return;
    }

    saving = true;
    try {
      await apiPost('/admin/practices', practice);
      addToast({ type: 'success', message: 'Practice created successfully', dismissible: true, timeout: 3000 });
      goto('/practice');
    } catch (e: any) {
      addToast({ type: 'error', message: e.message || 'Failed to create practice', dismissible: true, timeout: 5000 });
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>Add Practice</title>
</svelte:head>

<div class="flex items-center gap-3 mb-5">
  <button class="btn btn-ghost btn-sm" on:click={() => goto('/practice')}>
    <Icon icon="mdi:arrow-left" class="text-lg" />
  </button>
  <h2 class="text-2xl uppercase">Add Practice</h2>
</div>

<div class="max-w-2xl">
  <div class="card bg-base-200 shadow-lg">
    <div class="card-body">
      <form on:submit|preventDefault={createPractice}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Name -->
          <div class="form-control md:col-span-2">
            <label class="label" for="name">
              <span class="label-text">Practice Name <span class="text-error">*</span></span>
            </label>
            <input
              id="name"
              type="text"
              class="input input-bordered w-full"
              bind:value={practice.name}
              placeholder="e.g. Demo Chiropractic"
              required
            />
          </div>

          <!-- Location ID -->
          <div class="form-control md:col-span-2">
            <label class="label" for="location">
              <span class="label-text">Location ID (from GHL) <span class="text-error">*</span></span>
            </label>
            <input
              id="location"
              type="text"
              class="input input-bordered w-full"
              bind:value={practice.location}
              placeholder="e.g. abc123xyz"
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
              placeholder="Optional"
            />
          </div>

          <!-- Timezone -->
          <div class="form-control md:col-span-2">
            <label class="label" for="timezone">
              <span class="label-text">Timezone</span>
            </label>
            <select id="timezone" class="select select-bordered w-full" bind:value={practice.timezone}>
              {#each timezoneOptions as tz}
                <option value={tz}>{tz}</option>
              {/each}
            </select>
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
            Create Practice
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
