<script lang="ts">
  import Toast from './Toast.svelte';
  import { removeToast, toasts } from './store';

</script>

{#if $toasts}
  <section>
    {#each $toasts as toast (toast.id)}
      <Toast
        type={toast.type}
        dismissible={toast.dismissible}
        on:dismiss={() => removeToast(toast.id)}
      >
        {toast.message}
      </Toast>
    {/each}
  </section>
{/if}

<style>
  section {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    display: flex;
    margin-top: 1rem;
    justify-content: center;
    flex-direction: column;
    z-index: 1010;
  }
</style>
