<script lang="ts">
  import type { CssClasses } from '$lib/index.js';

//--[ Misc Props ]-------------------------------------------------------------
  // a11y props
  export let label = '';
  export let labelledBy = '';

//--[ region props ]---------------------------------------------------------
  export let rowMain: CssClasses = '';
  export let rowHeadline: CssClasses = '';
//-----------------------------------------------------------------------------

//--[ slot props ]-----------------------------------------------------------
  export let slotLead: CssClasses = '';
  export let slotDefault: CssClasses = '';
  export let slotTrail: CssClasses = '';
//-----------------------------------------------------------------------------

//--[ base props ]-----------------------------------------------------------
  export let background: CssClasses = 'bg-surface-100-800-token';
  export let border: CssClasses = '';
  export let padding: CssClasses = 'p-4';
  export let shadow: CssClasses = '';
  export let spacing: CssClasses = 'space-y-4';
  export let gridColumns: CssClasses = 'grid-cols-[auto_1fr_auto]';
  export let gap: CssClasses = 'gap-4';
//-----------------------------------------------------------------------------

//--[ base classes ]-----------------------------------------------------------
  const baseClassAppBar= 'flex flex-col';
  const baseClassMainRow = 'grid items-center';
  const baseClassHeadlineRow = '';
  const baseClassLeadSlot = 'flex-none flex justify-between items-center';
  const baseClassDefaultSlot = 'flex-auto';
  const baseClassTrailSlot = 'flex-none flex items-center space-x-4';
//-----------------------------------------------------------------------------

//--[ reactive classes ]-------------------------------------------------------
  $: baseClasses = `${baseClassAppBar} ${background} ${border} ${spacing} ${padding} ${shadow} ${$$props.class ?? ''}`;
  $: mainRowClasses = `${baseClassMainRow} ${gridColumns} ${gap} ${rowMain}`;
  $: headlineRowClasses = `${baseClassHeadlineRow} ${rowHeadline}`;
  $: leadSlotClasses = `${baseClassLeadSlot} ${slotLead}`;
  $: defaultSlotClasses = `${baseClassDefaultSlot} ${slotDefault}`;
  $: trailSlotClasses = `${baseClassTrailSlot} ${slotTrail}`;
//-----------------------------------------------------------------------------  
</script>

<div class="app-bar {baseClasses}" data-testid="app-bar" aria-label={label} aria-labelledby={labelledBy}>
  <div class="app-bar-main-row {mainRowClasses}">
    {#if $$slots.lead}
      <div class="app-bar-slot-lead {leadSlotClasses}">
        <slot name="lead" />
      </div>
    {/if}

    <div class="app-bar-slot-default {defaultSlotClasses}">
      <slot />
    </div>

    {#if $$slots.trail}
      <div class="app-bar-slot-trail {trailSlotClasses}">
        <slot name="trail" />
      </div>
    {/if}
  </div>

{#if $$slots.headline}
  <div class="app-bar-headline-row {headlineRowClasses}">
    <slot name="headline" />
  </div>
{/if}

</div>