<script lang="ts">
  import { onMount } from 'svelte';
  import { apiGet } from '$lib/api';
  import type { DashboardData, Practice } from '$lib/types/common';
  import Icon from '@iconify/svelte';
  import StatCard from '$lib/components/DashboardCard/StatCard.svelte';

  let loading = true;
  let error = '';
  let totalPractices = 0;
  let totalPatients = 0;
  let totalAppointments = 0;
  let practices: Practice[] = [];

  onMount(async () => {
    try {
      const data = await apiGet<DashboardData>('/admin/dashboard');
      totalPractices = data.totalPractices;
      totalPatients = data.totalPatients;
      totalAppointments = data.totalAppointments;
      practices = data.practices || [];
    } catch (e: any) {
      error = e.message || 'Failed to load dashboard data';
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Dashboard</title>
</svelte:head>

<h2 class="text-2xl uppercase mb-5">Dashboard</h2>

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
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
    <StatCard
      title="Practices"
      icon="mdi:clipboard-pulse-outline"
      total={String(totalPractices)}
      subtitle="Total registered practices"
      cardClass="bg-base-200"
      buttonLabel="View All"
      buttonColor="btn-primary"
    />
    <StatCard
      title="Patients"
      icon="mdi:account-group-outline"
      total={String(totalPatients)}
      subtitle="Total patients across all practices"
      cardClass="bg-base-200"
      buttonLabel="Details"
      buttonColor="btn-secondary"
    />
    <StatCard
      title="Appointments"
      icon="mdi:calendar-check-outline"
      total={String(totalAppointments)}
      subtitle="Total appointments synced"
      cardClass="bg-base-200"
      buttonLabel="Details"
      buttonColor="btn-accent"
    />
  </div>

  <div class="card bg-base-200 shadow-lg">
    <div class="card-body">
      <h3 class="card-title text-lg">Practice Overview</h3>
      <div class="overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>Practice Name</th>
              <th>Software</th>
              <th>Timezone</th>
              <th>Patients</th>
              <th>Appointments</th>
              <th>Sync Status</th>
            </tr>
          </thead>
          <tbody>
            {#if practices.length === 0}
              <tr>
                <td colspan="6" class="text-center py-8 opacity-60">No practices found</td>
              </tr>
            {:else}
              {#each practices as practice}
                <tr>
                  <td>
                    <a href="/practice/{practice.location}" class="link link-hover font-medium">
                      {practice.name || practice.location || 'Unnamed practice'}
                    </a>
                  </td>
                  <td>
                    <span class="badge badge-outline">{practice.software || 'Unknown'}</span>
                  </td>
                  <td class="text-sm">{practice.timezone || '—'}</td>
                  <td>{practice.patientCount ?? 0}</td>
                  <td>{practice.appointmentCount ?? 0}</td>
                  <td>
                    {#if practice.lastSync}
                      <span class="badge badge-success badge-sm">Synced</span>
                    {:else}
                      <span class="badge badge-warning badge-sm">Never</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </div>
{/if}
