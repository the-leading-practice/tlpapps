<script lang="ts">
	import { DateTime } from 'luxon';
	import FloatingLabelInput from '../Input/FloatingLabelInput.svelte';
	import type { EventObject } from '$lib/types';
	import Toggle from '../Input/Toggle.svelte';
	import { createEventDispatcher, onMount } from 'svelte';
	import { userService } from '$lib/services/supabase';
	import InputChip from '../Input/InputChip.svelte';
	import DataList from '../DataList/DataList.svelte';
  import type {DataListItem} from '../DataList/types';
	import { allUsers } from '$lib/stores/userstore';
	import { ordinalSuffix } from '$lib/utils/stringUtils';

  export let event: EventObject;

	let modal: HTMLDialogElement;
	let options: DataListItem[] = [];
  let repeats: string = "";
  let users: string[] = [];


  const userList: DataListItem[] = [
    {index:0, label: "Michael Heien", value:"333", metaData:{email:"mike@scurto.com"}},
    {index:1, label: "Tobby Lykins", value:"222", metaData:{email:"tobby@scurto.com"}}
  ];

	const dispatcher = createEventDispatcher();

	export const show = () => {
		modal.showModal();
	}

	const handleEventSave = ( evt: MouseEvent ) => {
		dispatcher( "save", {event: event } );
    modal.close();
	}

	const handleOnRepeatChange = () => {
		console.log( repeats );
	}


  allUsers.subscribe( async ( users ) => {
    let avatarUrl = '';
    let userList: DataListItem[] = [];

    if( !users ) return;
    
    for( let idx = 0; idx < users.length; idx++ ) {
      let u = users[idx];
      
      if( u.avatar_url ) {
        const {url, error} = await userService.getAvatarUrl( u.avatar_url );
        avatarUrl = url;
      }
      
      userList.push( {
        index: idx,
        label: `${u.first_name} ${u.last_name}`,
        value: u.id || '',
        metaData: {
          email: u.email,
          avatar: avatarUrl,
          color: u.profile_color
        }
      } );
    }

    options = [...userList];
  } );

	$: span = `${DateTime.fromISO( event.start.toISOString() ).toFormat( "h:mm")} - ${DateTime.fromISO( event.end.toISOString() ).toFormat( "h:mm")}`;
	$: title = event.title;
	$: startString = DateTime.fromISO( event.start.toISOString() ).toFormat( "yyyy-MM-dd'T'hh:mm:ss");
	$: endString = DateTime.fromISO( event.end.toISOString() ).toFormat( "yyyy-MM-dd'T'hh:mm:ss");
	$: dayName = DateTime.fromISO( event.start.toISOString() ).toFormat( "EEEE" );
	$: day = DateTime.fromISO( event.start.toISOString() ).toFormat( "d" );
	$: dayOfWeek = DateTime.fromISO( event.start.toISOString() ).toFormat( "E" );
	$: monthName = DateTime.fromISO( event.start.toISOString() ).toFormat( "MMMM" );
	$: weekOfMonth = Math.ceil( ( parseInt( day ) - 1 - parseInt( dayOfWeek ) ) / 7 ) + 1;
</script>

<dialog id="eventEditor" class="modal" bind:this={modal}>
  <div class="modal-box">
    <h3 class="font-bold text-lg mb-4">{span} {title}</h3>
    <FloatingLabelInput name="title" label="Title" bind:value={event.title} />
		<FloatingLabelInput type="datetime-local" name="start" label="Start" bind:value={startString} />
		<FloatingLabelInput type="datetime-local" name="end" label="End" bind:value={endString} />
		
    <div class="flex flex-row justify-between gap-3 ">
      <Toggle label="All Day" name="allDay" class="flex-1" toggleClass="toggle-success" bind:checked={event.allDay} />
      
      <select class="select select-bordered w-full mb-4 flex-1" bind:value={repeats} on:change={handleOnRepeatChange}>
        <option value="">Does Not Repeat</option>
        <option value="daily">Daily</option>
        <option value="weeklyOnDay">Weekly on {dayName}</option>
        <option value="monthlyOnWeekday">Monthly on the {weekOfMonth}{ordinalSuffix(weekOfMonth)} week on {dayName}</option>
        <option value="annuallyOnDay">Annually on {monthName} {day}{ordinalSuffix(parseInt(day))}</option>
        <option value="weekday">Every weekday (Monday to Friday)</option>
        <option value="custom">Custom...</option>
      </select>
    </div>
		
    <InputChip 
      name="add-users" 
      placeholder="Assign Users..." 
      chips="bg-neutral" 
      itemList={options} 
      allowUpperCase={true}
      bind:value={users}
      />
		
    <textarea class="textarea textarea-bordered w-full h-32" name="description" placeholder="Description" />

    <div class="modal-action">
				<button class="btn btn-success" on:click={handleEventSave}>Save</button>
      <form method="dialog">
        <!-- if there is a button in form, it will close the modal -->
        <button class="btn">Close</button>
      </form>
    </div>
  </div>
</dialog>

<style>
	:global(.user-select) {
		margin-left: 13px;
	}
</style>