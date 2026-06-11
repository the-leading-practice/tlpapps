<script lang="ts">
  /**
   * SyncCard — section card wrapper with optional header + right slot.
   * Consistent card shell for all sync section surfaces.
   */
  export let title: string = '';
  export let padBody: boolean = true;
</script>

<div class="rounded-xl border border-base-content/10 bg-base-200/60 shadow-sm">
  {#if title || $$slots.action}
    <div class="flex items-center justify-between px-5 py-3 border-b border-base-content/10">
      {#if title}
        <h3 class="text-sm font-semibold text-base-content">{title}</h3>
      {/if}
      {#if $$slots.action}
        <div class="flex items-center gap-2">
          <slot name="action" />
        </div>
      {/if}
    </div>
  {/if}
  <div class={padBody ? 'p-5' : ''}>
    <slot />
  </div>
</div>
