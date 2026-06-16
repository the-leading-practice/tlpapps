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
        throw new Error("This location isn't onboarded.");
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

    // Where to land after auth — a guard may pass ?return=<path>; default to controls.
    const rawReturn = params.get('return');
    const dest = rawReturn && rawReturn.startsWith('/') ? rawReturn : '/sync/controls';

    // Dev/standalone fallback: ?token=<jwt> injects token directly (explicit only).
    const directToken = params.get('token');
    if (directToken) {
      localStorage.setItem('tlp_token', directToken);
      goto(dest);
      return;
    }

    // Primary path: ?ssoData= from GHL iframe URL.
    const ssoData = params.get('ssoData');
    if (ssoData) {
      try {
        await exchangeSso(ssoData);
        goto(dest);
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

      // GHL replies to REQUEST_USER_DATA with
      //   { message: 'REQUEST_USER_DATA_RESPONSE', payload: '<encrypted blob>' }
      // so the blob lives in `payload`. Keep the older property names as
      // defensive fallbacks for any white-label variant.
      const blob: string | undefined =
        d.payload ?? d.userData ?? d.ssoData ?? d.data?.userData ?? d.data?.payload;
      if (!blob || typeof blob !== 'string') return;
      if (resolved) return;
      resolved = true;

      window.removeEventListener('message', handleMessage);
      try {
        await exchangeSso(blob);
        goto(dest);
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

<div class="embed-root">
  {#if state === 'loading'}
    <div class="embed-card">
      <!-- Spinner -->
      <div class="spinner" aria-label="Loading" role="status">
        <div class="spinner-ring"></div>
        <div class="spinner-ring spinner-ring--delay"></div>
      </div>
      <p class="embed-status">{statusMessage}</p>
    </div>
  {:else}
    <div class="embed-card embed-card--error">
      <!-- Error icon -->
      <div class="error-icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <p class="embed-error-title" role="alert">Authentication failed</p>
      <p class="embed-error-msg">{errorMessage}</p>
    </div>
  {/if}
</div>

<style>
  /* Intentionally scoped vanilla CSS — no daisyUI tokens here since
     this page may load before the admin shell and has no outer layout. */
  .embed-root {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #0f172a;
    font-family: system-ui, -apple-system, sans-serif;
    padding: 1.5rem;
  }

  .embed-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    background: #1e293b;
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 1rem;
    padding: 2.5rem 3rem;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
    max-width: 22rem;
    width: 100%;
    text-align: center;
  }

  .embed-card--error {
    border-color: rgba(239, 68, 68, 0.25);
    background: #1e1520;
  }

  /* Spinner */
  .spinner {
    position: relative;
    width: 2.5rem;
    height: 2.5rem;
  }

  .spinner-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2.5px solid transparent;
    border-top-color: #3b82f6;
    animation: spin 0.9s linear infinite;
  }

  .spinner-ring--delay {
    border-top-color: rgba(59, 130, 246, 0.3);
    animation-delay: -0.45s;
    animation-direction: reverse;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .embed-status {
    font-size: 0.875rem;
    color: #94a3b8;
    margin: 0;
  }

  /* Error state */
  .error-icon {
    color: #f87171;
    opacity: 0.9;
  }

  .embed-error-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: #fca5a5;
    margin: 0;
  }

  .embed-error-msg {
    font-size: 0.8125rem;
    color: #94a3b8;
    line-height: 1.5;
    margin: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner-ring {
      animation: none;
      border-top-color: #3b82f6;
      border-right-color: rgba(59, 130, 246, 0.3);
    }
  }
</style>
