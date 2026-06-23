<script lang="ts">
  import { onMount } from 'svelte';
  import { getSession, sessionDisplayName, type TlpSession } from '$lib/utils/session';
  import { formatDateTime } from '$lib/utils/stringUtils';

  let session: TlpSession | null = null;
  onMount(() => {
    session = getSession();
  });
</script>

<svelte:head>
  <title>Profile</title>
</svelte:head>

<h2 class="text-2xl uppercase mb-5">Profile</h2>

{#if session}
  <div class="card bg-base-200 shadow-lg max-w-xl">
    <div class="card-body">
      <h3 class="card-title">{sessionDisplayName(session)}</h3>
      <table class="table">
        <tbody>
          <tr><td class="opacity-60">Practice</td><td>{session.name || '—'}</td></tr>
          <tr><td class="opacity-60">Location ID</td><td class="font-mono text-sm">{session.location || '—'}</td></tr>
          <tr><td class="opacity-60">Software</td><td>{session.software || '—'}</td></tr>
          <tr><td class="opacity-60">Timezone</td><td>{session.timezone || '—'}</td></tr>
          <tr><td class="opacity-60">Calendar</td><td class="font-mono text-sm">{session.calendar || '—'}</td></tr>
          <tr>
            <td class="opacity-60">Session expires</td>
            <td>{session.exp ? formatDateTime(session.exp * 1000) : '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
{:else}
  <div class="alert alert-warning max-w-xl">
    <span>Not signed in. Open the admin from the GHL menu to authenticate.</span>
  </div>
{/if}
