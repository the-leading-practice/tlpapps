<script lang="ts" context="module">
  export interface ListRowData {
    level: string;
    from: string;
    title: string;
    due: string;
  }
</script>

<script lang="ts">
  import type { CssClasses } from "$lib";
	import { SUPPORT_URL } from "$lib/constants";
	import { freshdeskService } from "$lib/services/freshdesk";
	import { profile } from "$lib/stores/userstore";
	import Icon from "@iconify/svelte";

  export let title: string;
  export let supportList: any[];

  export let icon = "";
  export let subtitle = "";
  export let buttonLabel = "More";

  export let cardClass: CssClasses = "";
  export let cardWidth: CssClasses = "w-full";
  export let shadowClass: CssClasses = "shadow-xl";
  export let titleClass: CssClasses = "";
  export let iconClass: CssClasses = "";
  export let subtitleClass: CssClasses = "";
  
  export let buttonColor: CssClasses = "";

  const cardBase = "card card-compact";
  const titleBase = "card-title";
  const buttonBase = "btn";

  const icons = [
		{icon:'', color: ''},
    {icon:'mdi:alert-circle-outline', color:'text-error'},
    {icon:'mdi:information-slab-circle-outline', color:'text-success'},
    {icon:'mdi:information-slab-circle-outline', color:'text-info'}
  ];

  $: cardClasses = `${cardBase} ${cardClass} ${cardWidth} ${shadowClass}`;
  $: titleClasses = `${titleBase} ${titleClass}`;
  $: iconClasses = `${iconClass}`;
  $: subtitleClasses = `${subtitleClass}`;
  
  $: buttonClasses = `${buttonBase} ${buttonColor}`;

//--[ Data Collection ]-------------------------------------------------------
	// let supportData: any[] = [];
	// profile.subscribe( async ( p ) => {
	// 	if( p?.freshdesk_id ) {
	// 		const supportResp = await freshdeskService.getOpenTicketsForAgent( p.freshdesk_id );

	// 		if( supportResp.status >= 200 && supportResp.status < 400 ) {
	// 			// load support items here
	// 			supportData = [...supportResp.data.results.slice( 0, 5 )];
	// 		}
	// 	}
	// } );

  const getIcon = ( key: number ) => {
		if( key > icons.length-1 ) return {icon:'mdi:information-slab-circle-outline', color:'info'};
		return icons[key];
  }

	const isOverdue = ( dueBy: string ) => {
		const today = new Date();
		const dueDate = new Date( dueBy );

		return dueDate.getTime() < today.getTime();
	}

</script>


<div class="stat-card {cardClasses}">
  <div class="card-body">
    <h3 class="{titleClasses}">
      {#if icon.length > 0 }
        <Icon icon={icon} class="title-icon {iconClasses}" />
      {/if}
       {title}
    </h3>
    <span class="subtitle {subtitleClasses}">{subtitle}</span>
    <table class="table table-sm">
      <thead>
        <tr>
          <td class="w-[24px]">Priority</td>
          <td>Description</td>
          <td class="w-[150px]">Due</td>
        </tr>
      </thead>
      <tbody>
				{#if supportList && supportList.length > 0}
					{#each supportList as row}
						<tr>
							<td class="text-center {getIcon( row.priority ).color}"><Icon icon={getIcon( row.priority ).icon} /></td>
							<td><a href="{SUPPORT_URL}/a/tickets/{row.id}" target="_blank">{row.subject}</a></td>
							<td class="{isOverdue( row.due_by ) ? 'text-error' : 'text-normal'}">{row.due_by.split( 'T' )[0]}</td>
						</tr>
					{/each}
				{/if}
      </tbody>
    </table>
    <div class="card-actions justify-end">
      <a 
				class="more-button {buttonClasses}" 
				href="https://support.scurto.com/a/tickets/filters/search?orderBy=created_at&orderType=desc&q[]=agent%3A%5B{$profile?.freshdesk_id}%5D"
				target="_href" >
				{buttonLabel}
			</a>
    </div>
  </div>
</div>