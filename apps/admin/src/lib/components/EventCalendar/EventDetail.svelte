<script lang="ts">
  import { DateTime } from 'luxon';
	import type { EventObject } from "$lib/types";
  import Icon from '@iconify/svelte';
	import { createEventDispatcher } from 'svelte';
	import type { Mouse } from '@playwright/test';

  export let event: EventObject;
  let modal: HTMLDialogElement;

  const dispatcher = createEventDispatcher();

  export const show = () => {
		modal.showModal();
	}

  const handleEditClick = ( even: MouseEvent ) => {
    dispatcher( "edit" );
    modal.close();
  }

  $: timeSpan = `${DateTime.fromISO( event.start.toISOString() ).toFormat( "h:mm a" )} - ${DateTime.fromISO( event.end.toISOString() ).toFormat( "h:mm a" )}`;
  $: date = `${DateTime.fromISO( event.start.toISOString() ).toFormat( "cccc, LLLL d" )}`;
</script>

<dialog id="eventEditor" class="modal" bind:this={modal}>
  <div class="modal-box">
    <div class="flex flex-row flex-[1 auto 1] gap-4 items-center">
      <div class="w-4 h-4 rounded bg-slate-300"></div>
      <h2 class="text-xl grow">{event.title}</h2>
      <div class="flex flex-row gap-2">
        <button class="btn text-xl" on:click={handleEditClick}><Icon icon="mdi-pencil-outline" /></button>
        <button class="btn text-xl"><Icon icon="mdi-trash-can-outline" /></button>
      </div>
    </div>
    <div>{date} • {timeSpan}</div>
    <div class="mb-8">Repeat Details</div>
    <div>Description</div>

    <div class="modal-action">
      <form method="dialog">
        <!-- if there is a button in form, it will close the modal -->
        <button class="btn">Close</button>
      </form>
    </div>
  </div>
</dialog>