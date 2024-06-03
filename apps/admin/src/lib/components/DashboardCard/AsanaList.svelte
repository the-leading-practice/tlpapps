<script lang="ts">
  import type { CssClasses } from "$lib";
	import { profile } from "$lib/stores/userstore";
	import Icon from "@iconify/svelte";

  export let title: string;
  export let taskList: any[];

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

	const truncateBadge = ( name: string ) => {
		if( name.length > 10 ) {
			return `${name.substring( 0, 9 )}...`;
		}

		return name;
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
          <td>Description</td>
          <td></td>
        </tr>
      </thead>
      <tbody>
				{#if taskList && taskList.length > 0}
					{#each taskList as row}
						<tr>
							<td><a href="{row.data.permalink_url}" target="_blank">{row.data.name}</a></td>
							<td>
								{#each row.data.memberships as proj}
									{#if proj.project.resource_type === 'project'}
									<div class="badge badge-outline">{truncateBadge( proj.project.name )}</div>
									{/if}
								{/each}
							</td>
						</tr>
					{/each}
				{/if}
      </tbody>
    </table>
    <div class="card-actions justify-end">
      <a 
				class="more-button {buttonClasses}" 
				href="https://app.asana.com/0/home/{$profile?.asana_id}"
				target="_href" >
				{buttonLabel}
			</a>
    </div>
  </div>
</div>