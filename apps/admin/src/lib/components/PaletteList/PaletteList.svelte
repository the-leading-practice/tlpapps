<script lang="ts">
  import {PALETTE_COLORS} from '$lib/constants';
	import { createEventDispatcher } from 'svelte';

  export let title: string = '';
  export let selected: string = '';

  const dispatcher = createEventDispatcher();

  const handleClick = ( event: MouseEvent, color: string ) => {
    dispatcher( "change", {color: color} );
  }

</script>

<div class='mb-2'>
  <div>{title}</div>
  <div class="flex flex-row flex-wrap gap-1 w-[336px]">
    {#each PALETTE_COLORS as color}
      <button 
        class="rounded border-white border-[1px] w-[24px] h-[24px] hover:opacity-100 {selected===color?'opacity-100':'opacity-25'}" 
        style="background-color: {color}" 
        on:click|preventDefault={(e)=>handleClick( e, color )}>
      </button>
    {/each}
  </div>
</div>