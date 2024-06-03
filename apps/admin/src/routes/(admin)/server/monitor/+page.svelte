<script lang="ts">
	import { monitorService } from "$lib/services/monitorService";
  import { onMount } from "svelte"

	let containers: any[] = [];

	onMount( async () => {
		const svcs = await monitorService.getContainers();

		svcs.forEach( async (c: any) => {
			c.stats = await monitorService.getStats( c.Id );
			console.log( c );
		} );

		containers = [...svcs];
	} );

	const formatName = (name: string) => {
		let [svc, type] = name.split( '-' );
		svc = svc.charAt(0).toUpperCase() + svc.slice(1);
		type = type.charAt(0).toUpperCase() + type.slice(1);

		return `${svc} ${type}`;
	}

</script>

{#if containers}
	{#each containers as container}
		<div class="card w-full shadow-lg">
			<div class="card-body">
				<h2 class="text-xl">{formatName( container.Image )}</h2>
				<ul>
					<li>State: {container.State}</li>
					<li>Up Time: {container.Status}</li>
					<li class="flex flex-col">
						{#if container.stats }
							<div>Mem: {container.stats.memory_stats.usage}</div>
						{/if}
					</li>
				</ul>
				<div class="text-xs mt-4">{container.Id}</div>
			</div>
		</div>
	{/each}
{/if}

