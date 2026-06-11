<script lang="ts">
  /**
   * StatusPill — canonical status indicator for sync section.
   *
   * variant: 'status' — event/record status (processed, failed/dead, pending, default)
   * variant: 'mode'   — sync mode (on, dry, off)
   */
  export let status: string = '';
  export let variant: 'status' | 'mode' = 'status';

  $: classes = (() => {
    const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1';
    if (variant === 'mode') {
      if (status === 'on')  return `${base} bg-emerald-500/15 ring-emerald-500/30 text-emerald-300`;
      if (status === 'dry') return `${base} bg-amber-500/15 ring-amber-500/30 text-amber-300`;
      return `${base} bg-rose-500/15 ring-rose-500/30 text-rose-300`;
    }
    // variant === 'status'
    if (status === 'processed') return `${base} bg-emerald-500/15 ring-emerald-500/30 text-emerald-300`;
    if (status === 'pending')   return `${base} bg-amber-500/15 ring-amber-500/30 text-amber-300`;
    if (status === 'failed' || status === 'dead') return `${base} bg-rose-500/15 ring-rose-500/30 text-rose-300`;
    return `${base} bg-base-content/10 ring-base-content/20 text-base-content/60`;
  })();
</script>

<span class={classes}>{status}</span>
