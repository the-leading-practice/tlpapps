<script lang="ts">
  /**
   * SyncStatCard — KPI stat card for the sync dashboard.
   */
  import Icon from '@iconify/svelte';

  export let label: string = '';
  export let value: number | string = 0;
  export let icon: string = '';
  export let tone: 'neutral' | 'success' | 'warning' | 'error' = 'neutral';

  const toneMap: Record<string, string> = {
    neutral: 'text-base-content/50',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    error:   'text-rose-400',
  };
  const bgMap: Record<string, string> = {
    neutral: '',
    success: 'border-emerald-500/20',
    warning: 'border-amber-500/20',
    error:   'border-rose-500/20',
  };

  $: iconColor = toneMap[tone] ?? toneMap.neutral;
  $: borderExtra = bgMap[tone] ?? '';
</script>

<div class="rounded-xl border border-base-content/10 {borderExtra} bg-base-200/60 shadow-sm p-4 flex flex-col gap-2">
  <div class="flex items-center gap-2">
    {#if icon}
      <Icon {icon} class="text-base {iconColor}" />
    {/if}
    <span class="text-xs text-base-content/50 uppercase tracking-wide font-medium">{label}</span>
  </div>
  <div class="text-2xl font-bold text-base-content">{value}</div>
</div>
