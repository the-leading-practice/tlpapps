<script lang="ts">
  /**
   * GHL SSO embed shell — EMBED-04
   *
   * Entry point when the admin panel is loaded as a GHL iframe app.
   * Flow:
   *   1. Try ?ssoData= query param (GHL appends it directly on the iframe URL).
   *   2. If absent, send REQUEST_USER_DATA postMessage to parent and wait for
   *      the encrypted blob to come back.
   *   3. POST blob to /api/crm/sso; on 200 store returned JWT in
   *      localStorage.tlp_token (the key apiFetch reads) and navigate to the
   *      sync controls panel.
   *
   * Dev/standalone fallback:
   *   Load /embed?token=<jwt> to inject a pre-minted JWT directly (operator
   *   testing only — never auto-applied; requires explicit ?token= param).
   *
   * Error states:
   *   503 — GHL_APP_SSO_KEY not configured (owner action required).
   *   409 — Location not onboarded.
   *   401 — SSO blob verification failed.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  const API_BASE = 'https://tlpapps.theleadingpractice.com/api';

  type EmbedState = 'loading' | 'error';

  let state: EmbedState = 'loading';
  let statusMessage = 'Authenticating…';
  let errorMessage = '';

  async function exchangeSso(ssoData: string): Promise<void> {
    const res = await fetch(`${API_BASE}/crm/sso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssoData }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 503) {
        throw new Error('Sync admin SSO is not configured yet (awaiting GHL_APP_SSO_KEY).');
      } else if (res.status === 409) {
        throw new Error('This location isn\'t onboarded.');
      } else if (res.status === 401) {
        throw new Error('SSO verification failed.');
      } else {
        throw new Error(text || `SSO error: ${res.status}`);
      }
    }

    const data = await res.json();
    if (!data?.token) {
      throw new Error('SSO response missing token.');
    }
    localStorage.setItem('tlp_token', data.token);
  }

  onMount(async () => {
    const params = $page.url.searchParams;

    // Dev/standalone fallback: ?token=<jwt> injects token directly (explicit only).
    const directToken = params.get('token');
    if (directToken) {
      localStorage.setItem('tlp_token', directToken);
      goto('/sync/controls');
      return;
    }

    // Primary path: ?ssoData= from GHL iframe URL.
    const ssoData = params.get('ssoData');
    if (ssoData) {
      try {
        await exchangeSso(ssoData);
        goto('/sync/controls');
      } catch (err: any) {
        errorMessage = err?.message ?? 'Unknown SSO error.';
        state = 'error';
      }
      return;
    }

    // Fallback: postMessage handshake with GHL parent frame.
    statusMessage = 'Requesting session from GHL…';
    let resolved = false;

    const handleMessage = async (event: MessageEvent) => {
      // Accept any origin — GHL sends from their domain; we validate server-side.
      const d = event.data;
      if (!d || typeof d !== 'object') return;

      // GHL sends the encrypted blob as userData or ssoData property.
      const blob: string | undefined = d.userData ?? d.ssoData ?? d.data?.userData;
      if (!blob || typeof blob !== 'string') return;
      if (resolved) return;
      resolved = true;

      window.removeEventListener('message', handleMessage);
      try {
        await exchangeSso(blob);
        goto('/sync/controls');
      } catch (err: any) {
        errorMessage = err?.message ?? 'Unknown SSO error.';
        state = 'error';
      }
    };

    window.addEventListener('message', handleMessage);

    // Kick off the GHL postMessage handshake.
    window.parent.postMessage({ message: 'REQUEST_USER_DATA' }, '*');

    // Timeout: if no reply after 8 s, surface a helpful error.
    setTimeout(() => {
      if (!resolved) {
        window.removeEventListener('message', handleMessage);
        errorMessage =
          'No SSO data received. Load this page inside a GHL iframe, or ' +
          'supply ?ssoData= / ?token= for standalone testing.';
        state = 'error';
      }
    }, 8000);
  });
</script>

{#if state === 'loading'}
  <div class="embed-shell">
    <p class="status">{statusMessage}</p>
  </div>
{:else}
  <div class="embed-shell embed-shell--error">
    <p class="error-msg">{errorMessage}</p>
  </div>
{/if}

<style>
  .embed-shell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    font-family: sans-serif;
    font-size: 0.95rem;
    color: #444;
  }
  .embed-shell--error {
    color: #b91c1c;
  }
</style>
