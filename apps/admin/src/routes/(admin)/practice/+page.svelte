<script lang="ts">
  import { onMount } from 'svelte';
  import { apiGet, apiDelete } from '$lib/api';
  import { addToast } from '$lib/components/Toast';
  import type { Practice } from '$lib/types/common';
  import Icon from '@iconify/svelte';

  let loading = true;
  let error = '';
  let practices: Practice[] = [];
  let deleteTarget: Practice | null = null;
  let deleting = false;

  onMount(async () => {
    await loadPractices();
  });

  async function loadPractices() {
    loading = true;
    error = '';
    try {
      practices = await apiGet<Practice[]>('/admin/practices');
    } catch (e: any) {
      error = e.message || 'Failed to load practices';
    } finally {
      loading = false;
    }
  }

  function confirmDelete(practice: Practice) {
    deleteTarget = practice;
  }

  function cancelDelete() {
    deleteTarget = null;
  }

  async function deletePractice() {
    if (!deleteTarget) return;
    deleting = true;
    try {
      await apiDelete(`/admin/practices/${deleteTarget.location}`);
      addToast({ type: 'success', message: `Deleted ${deleteTarget.name}`, dismissible: true, timeout: 3000 });
      deleteTarget = null;
      await loadPractices();
    } catch (e: any) {
      addToast({ type: 'error', message: e.message || 'Failed to delete practice', dismissible: true, timeout: 5000 });
    } finally {
      deleting = false;
    }
  }
</script>

<svelte:head>
  <title>Practices</title>
</svelte:head>

<div class="flex justify-between items-center mb-5">
  <h2 class="text-2xl uppercase">Practices</h2>
  <a href="/practice/new" class="btn btn-primary">
    <Icon icon="mdi:plus" class="text-lg" />
    Add Practice
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
  <div class="card bg-base-200 shadow-lg">
    <div class="card-body">
      <div class="overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>Name</th>
              <th>Location ID</th>
              <th>Software</th>
              <th>Timezone</th>
              <th>Push Flags</th>
              <th>Actions</th>
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
                  <td class="font-medium">{practice.name}</td>
                  <td class="text-sm font-mono">{practice.location}</td>
                  <td>
                    <span class="badge badge-outline">{practice.software || 'Unknown'}</span>
                  </td>
                  <td class="text-sm">{practice.timezone}</td>
                  <td>
                    <div class="flex gap-1 flex-wrap">
                      {#if practice.pushGhl}
                        <span class="badge badge-primary badge-sm">GHL</span>
                      {/if}
                      {#if practice.pushAppointments}
                        <span class="badge badge-secondary badge-sm">Appt</span>
                      {/if}
                      {#if practice.pushPatients}
                        <span class="badge badge-accent badge-sm">Pat</span>
                      {/if}
                      {#if !practice.pushGhl && !practice.pushAppointments && !practice.pushPatients}
                        <span class="badge badge-ghost badge-sm">None</span>
                      {/if}
                    </div>
                  </td>
                  <td>
                    <div class="flex gap-2">
                      <a href="/practice/{practice.location}" class="btn btn-sm btn-neutral">
                        <Icon icon="mdi:pencil-outline" />
                        Edit
                      </a>
                      <button class="btn btn-sm btn-error btn-outline" on:click={() => confirmDelete(practice)}>
                        <Icon icon="mdi:trash-can-outline" />
                        Delete
                      </button>
                    </div>
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

<!-- Delete Confirmation Modal -->
{#if deleteTarget}
  <div class="modal modal-open">
    <div class="modal-box">
      <h3 class="font-bold text-lg">Confirm Delete</h3>
      <p class="py-4">
        Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
        This action cannot be undone.
      </p>
      <div class="modal-action">
        <button class="btn" on:click={cancelDelete} disabled={deleting}>Cancel</button>
        <button class="btn btn-error" on:click={deletePractice} disabled={deleting}>
          {#if deleting}
            <span class="loading loading-spinner loading-sm"></span>
          {/if}
          Delete
        </button>
      </div>
    </div>
    <div class="modal-backdrop" on:click={cancelDelete} on:keydown={(e) => e.key === 'Escape' && cancelDelete()} role="button" tabindex="-1"></div>
  </div>
{/if}
