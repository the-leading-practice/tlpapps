<script lang="ts">
	import Calendar from '@event-calendar/core';
	import Interaction from '@event-calendar/interaction';
  import TimeGrid from '@event-calendar/time-grid';
  import DayGrid from '@event-calendar/day-grid';
	import ListDay from '@event-calendar/list';
	import EventEditor from './EventEditor.svelte';
	import type { EventObject } from '$lib/types';

  import '@event-calendar/core/index.css';
	import { calendarService } from '$lib/services/calendar';
	import { createEventDispatcher } from 'svelte';
	import { userSession } from '$lib/stores/userstore';
	import EventDetail from './EventDetail.svelte';

	let eventEditor: EventEditor;
  let eventDetail: EventDetail;
	let eventObject: EventObject = {
		title: '',
		start: new Date(),
		end: new Date()
	}

  const _pad = ( num: number ) => {
        let norm = Math.floor(Math.abs(num));
        return (norm < 10 ? '0' : '') + norm;
    }

	const handleLoading = ( isLoading: boolean ) => {
		console.log( isLoading );
	}

	const handleDateSelect = ( info: any ) => {
		eventObject = {...info};
		eventObject.title = '';
		eventEditor.show()
	}

	const handleEventClick = ( info: any ) => {
		eventObject = {...info.event};
		eventDetail.show();
	}

  const eventDetailEdit = ( event: EventObject ) => {
    eventObject = {...event};
    eventEditor.show();
  }

	const handleEventDrop = ( info: any ) => {
		console.log( info );
	}

	const handleNoEventsClick = ( info: any ) => {
		console.log( info )
	}

	const handleSave = async ( event: CustomEvent ) => {
		console.log( event.detail.event );
    const resp = await calendarService.addEntry( event.detail.event, $userSession );

    if( resp ) {
      console.log( resp.data );
      console.log( resp.error );
    }
	}

	const fetchEvents = async ( fetchInfo: any ) => {
		const resp = await calendarService.getAllEntries( fetchInfo.start, fetchInfo.end );
    if( resp.data && resp.data.length > 0 ) {
      let events: EventObject[] = [];
      resp.data.forEach( ( event ) => {
        const eventObj: EventObject = JSON.parse( event.entry_doc );
        delete event.view;
        eventObj.start = new Date( eventObj.start );
        eventObj.end = new Date( eventObj.end );
        
        eventObj.extendedProps = {
          id: event.id
        }

        events.push( eventObj );
      } );

      return events;
    }

		return [];
	}

		// documentation found at https://github.com/vkurko/calendar
    let plugins = [DayGrid, TimeGrid, ListDay, Interaction];
    let options = {
			editable: true,
			selectable: true,
      view: 'timeGridWeek',
			eventSources: [{events:fetchEvents}],
      height: "auto",
			nowIndicator: true,
			highlightedDates: [],
			headerToolbar: {
				start: 'today',
				center: 'title',
				end: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek prev,next'
			},
			loading: handleLoading,
			select: handleDateSelect,
			eventClick: handleEventClick,
			eventDrop: handleEventDrop,
			noEventsClick: handleNoEventsClick
    }
</script>

<div class="w-full h-auto ec-auto-dark">
	<EventEditor event={eventObject} bind:this={eventEditor} on:save={handleSave}/>
  <EventDetail event={eventObject} bind:this={eventDetail} on:edit={() => eventDetailEdit( eventObject ) }/>
  <Calendar {plugins} {options} />
</div>