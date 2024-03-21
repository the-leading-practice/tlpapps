<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fade } from 'svelte/transition';
  import SuccessIcon from './icons/SuccessIcon.svelte';
  import InfoIcon from './icons/InfoIcon.svelte';
  import ErrorIcon from './icons/ErrorIcon.svelte';
  import CloseIcon from './icons/CloseIcon.svelte';

  const dispatch = createEventDispatcher();

  export let type = 'error';
  export let dismissible = true;
</script>

<article class={type} transition:fade>
  {#if type === 'success'}
    <SuccessIcon width="1.1em" />
  {:else if type === 'error'}
    <ErrorIcon width="1.1em" />
  {:else}
    <InfoIcon width="1.1em" />
  {/if}

  <div class="text">
    <slot />
  </div>

  {#if dismissible}
    <button class="close" on:click={() => dispatch('dismiss')}>
      <CloseIcon width="0.8em" />
    </button>
  {/if}
</article>

<style>
  article {
    color: white;
    padding: 0.7em 1.5rem;
    border-radius: 0.2rem;
    display: flex;
    align-items: center;
    margin: 0 auto 0.5rem auto;
    width: 40rem;
  }

  .error {
    background: indianred;
  }

  .success {
    background: mediumseagreen;
  }

  .info {
    background: skyblue;
  }

  .text {
    margin-left: 1rem;
  }

  button {
    color: white;
    background: transparent;
    border: 0 none;
    padding: 0;
    margin: 0 0 0 auto;
    line-height: 1;
    font-size: 1rem;
  }
</style>
