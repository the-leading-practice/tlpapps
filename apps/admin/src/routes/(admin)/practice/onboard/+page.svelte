<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiPost } from '$lib/api';
  import { addToast } from '$lib/components/Toast';
  import type { Practice } from '$lib/types/common';
  import Icon from '@iconify/svelte';

  let currentStep = 0;
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

  const steps = ['Practice Info', 'EHR Software', 'Settings', 'Review'];

  function nextStep() {
    if (currentStep === 0 && (!practice.name.trim() || !practice.location.trim())) {
      addToast({ type: 'error', message: 'Name and Location ID are required', dismissible: true, timeout: 3000 });
      return;
    }
    if (currentStep === 1 && !practice.software) {
      addToast({ type: 'error', message: 'Please select a software type', dismissible: true, timeout: 3000 });
      return;
    }
    if (currentStep < steps.length - 1) {
      currentStep++;
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      currentStep--;
    }
  }

  async function submitPractice() {
    saving = true;
    try {
      await apiPost('/admin/practices', practice);
      addToast({ type: 'success', message: 'Practice onboarded successfully', dismissible: true, timeout: 3000 });
      goto('/practice');
    } catch (e: any) {
      addToast({ type: 'error', message: e.message || 'Failed to onboard practice', dismissible: true, timeout: 5000 });
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>Onboard Practice</title>
</svelte:head>

<h2 class="text-2xl uppercase mb-5">Onboard Practice</h2>

<!-- Steps Indicator -->
<ul class="steps steps-horizontal w-full mb-8">
  {#each steps as step, i}
    <li class="step" class:step-primary={i <= currentStep}>{step}</li>
  {/each}
</ul>

<div class="max-w-2xl mx-auto">
  <div class="card bg-base-200 shadow-lg">
    <div class="card-body">

      <!-- Step 1: Practice Info -->
      {#if currentStep === 0}
        <h3 class="card-title text-lg mb-4">Practice Information</h3>
        <div class="space-y-4">
          <div class="form-control">
            <label class="label" for="name">
              <span class="label-text">Practice Name <span class="text-error">*</span></span>
            </label>
            <input
              id="name"
              type="text"
              class="input input-bordered w-full"
              bind:value={practice.name}
              placeholder="e.g. Demo Chiropractic"
            />
          </div>
          <div class="form-control">
            <label class="label" for="location">
              <span class="label-text">GHL Location ID <span class="text-error">*</span></span>
            </label>
            <input
              id="location"
              type="text"
              class="input input-bordered w-full"
              bind:value={practice.location}
              placeholder="Enter the GHL location ID"
            />
            <label class="label">
              <span class="label-text-alt">Found in GHL under Settings &gt; Business Profile &gt; Location ID</span>
            </label>
          </div>
        </div>
      {/if}

      <!-- Step 2: EHR Software -->
      {#if currentStep === 1}
        <h3 class="card-title text-lg mb-4">EHR Software</h3>
        <div class="space-y-4">
          <div class="form-control">
            <label class="label" for="software">
              <span class="label-text">Software Type <span class="text-error">*</span></span>
            </label>
            <select id="software" class="select select-bordered w-full" bind:value={practice.software}>
              <option value="" disabled>Select EHR software</option>
              {#each softwareOptions as sw}
                <option value={sw}>{sw}</option>
              {/each}
            </select>
          </div>
          <div class="form-control">
            <label class="label" for="calendarId">
              <span class="label-text">Calendar ID</span>
            </label>
            <input
              id="calendarId"
              type="text"
              class="input input-bordered w-full"
              bind:value={practice.calendarId}
              placeholder="Optional - GHL Calendar ID"
            />
          </div>
        </div>
      {/if}

      <!-- Step 3: Settings -->
      {#if currentStep === 2}
        <h3 class="card-title text-lg mb-4">Push Settings and Timezone</h3>
        <div class="space-y-4">
          <div class="form-control">
            <label class="label" for="timezone">
              <span class="label-text">Timezone</span>
            </label>
            <select id="timezone" class="select select-bordered w-full" bind:value={practice.timezone}>
              {#each timezoneOptions as tz}
                <option value={tz}>{tz}</option>
              {/each}
            </select>
          </div>

          <div class="divider">Data Push Toggles</div>

          <div class="form-control">
            <label class="label cursor-pointer justify-start gap-3">
              <input type="checkbox" class="toggle toggle-primary" bind:checked={practice.pushGhl} />
              <div>
                <span class="label-text font-medium">Push to GHL</span>
                <p class="text-xs opacity-60 mt-1">Send data back to GoHighLevel</p>
              </div>
            </label>
          </div>
          <div class="form-control">
            <label class="label cursor-pointer justify-start gap-3">
              <input type="checkbox" class="toggle toggle-secondary" bind:checked={practice.pushAppointments} />
              <div>
                <span class="label-text font-medium">Push Appointments</span>
                <p class="text-xs opacity-60 mt-1">Sync appointment data from EHR</p>
              </div>
            </label>
          </div>
          <div class="form-control">
            <label class="label cursor-pointer justify-start gap-3">
              <input type="checkbox" class="toggle toggle-accent" bind:checked={practice.pushPatients} />
              <div>
                <span class="label-text font-medium">Push Patients</span>
                <p class="text-xs opacity-60 mt-1">Sync patient data from EHR</p>
              </div>
            </label>
          </div>
        </div>
      {/if}

      <!-- Step 4: Review -->
      {#if currentStep === 3}
        <h3 class="card-title text-lg mb-4">Review and Submit</h3>
        <div class="overflow-x-auto">
          <table class="table">
            <tbody>
              <tr>
                <th class="w-40">Name</th>
                <td>{practice.name}</td>
              </tr>
              <tr>
                <th>Location ID</th>
                <td class="font-mono text-sm">{practice.location}</td>
              </tr>
              <tr>
                <th>Software</th>
                <td>{practice.software}</td>
              </tr>
              <tr>
                <th>Calendar ID</th>
                <td>{practice.calendarId || '(not set)'}</td>
              </tr>
              <tr>
                <th>Timezone</th>
                <td>{practice.timezone}</td>
              </tr>
              <tr>
                <th>Push GHL</th>
                <td>
                  {#if practice.pushGhl}
                    <span class="badge badge-primary badge-sm">Enabled</span>
                  {:else}
                    <span class="badge badge-ghost badge-sm">Disabled</span>
                  {/if}
                </td>
              </tr>
              <tr>
                <th>Push Appointments</th>
                <td>
                  {#if practice.pushAppointments}
                    <span class="badge badge-secondary badge-sm">Enabled</span>
                  {:else}
                    <span class="badge badge-ghost badge-sm">Disabled</span>
                  {/if}
                </td>
              </tr>
              <tr>
                <th>Push Patients</th>
                <td>
                  {#if practice.pushPatients}
                    <span class="badge badge-accent badge-sm">Enabled</span>
                  {:else}
                    <span class="badge badge-ghost badge-sm">Disabled</span>
                  {/if}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      {/if}

      <!-- Navigation Buttons -->
      <div class="card-actions justify-between mt-6">
        <div>
          {#if currentStep > 0}
            <button class="btn btn-outline" on:click={prevStep}>
              <Icon icon="mdi:arrow-left" />
              Back
            </button>
          {/if}
        </div>
        <div>
          {#if currentStep < steps.length - 1}
            <button class="btn btn-primary" on:click={nextStep}>
              Next
              <Icon icon="mdi:arrow-right" />
            </button>
          {:else}
            <button class="btn btn-success" on:click={submitPractice} disabled={saving}>
              {#if saving}
                <span class="loading loading-spinner loading-sm"></span>
              {/if}
              <Icon icon="mdi:check" />
              Submit
            </button>
          {/if}
        </div>
      </div>

    </div>
  </div>
</div>
