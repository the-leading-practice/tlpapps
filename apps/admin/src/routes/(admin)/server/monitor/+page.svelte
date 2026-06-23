<script lang="ts">
	import { monitorService } from "$lib/services/monitorService";
  import { onMount } from "svelte"
  import Icon from "@iconify/svelte";

	let containers: any[] = [];
	let loading = true;
	let error = '';

	onMount( async () => {
		try {
			const svcs = await monitorService.getContainers();
			const list = Array.isArray( svcs ) ? svcs : [];

			// Best-effort per-container stats; a stats failure must not blank the page.
			await Promise.all(
				list.map( async (c: any) => {
					try {
						c.stats = await monitorService.getStats( c.Id );
					} catch ( _ ) {
						c.stats = null;
					}
				} ),
			);

			containers = list;
		} catch ( e: any ) {
			error = e?.message || 'Failed to load container list. The monitor endpoint is unavailable (no Docker socket in this environment).';
		} finally {
			loading = false;
		}
	} );

	const formatName = (name: string) => {
		if( !name ) return 'Unknown';
		let [svc, type] = name.split( '-' );
		svc = svc ? svc.charAt(0).toUpperCase() + svc.slice(1) : '';
		type = type ? type.charAt(0).toUpperCase() + type.slice(1) : '';

		return `${svc} ${type}`.trim() || name;
	}

</script>

<h2 class="text-2xl uppercase mb-5">Server Monitor</h2>

{#if loading}
	<div class="flex justify-center py-12">
		<span class="loading loading-spinner loading-lg"></span>
	</div>
{:else if error}
	<div class="alert alert-error mb-4">
		<Icon icon="mdi:alert-circle-outline" class="text-xl" />
		<span>{error}</span>
	</div>
{:else if containers.length === 0}
	<div class="text-center py-12 opacity-60">No containers reported.</div>
{:else}
	{#each containers as container}
		<div class="card w-full shadow-lg">
			<div class="card-body">
				<h2 class="text-xl">{formatName( container.Image )}</h2>
				<ul>
					<li>State: {container.State}</li>
					<li>Up Time: {container.Status}</li>
					<li class="flex flex-col">
						{#if container.stats?.memory_stats?.usage != null}
							<div>Mem: {container.stats.memory_stats.usage}</div>
						{/if}
					</li>
				</ul>
				<div class="text-xs mt-4">{container.Id}</div>
			</div>
		</div>
	{/each}
{/if}

