<script lang="ts">
  export let data: any;

  // The /configs payload is shaped { location, config: { Software, ... } } and
  // carries no top-level practice `name`. Title with the best available label:
  // explicit name → software → location.
  function configTitle(c: any): string {
    return c?.name || c?.config?.Software || c?.location || 'Untitled config';
  }

  $: configs = (data?.configs ?? []) as any[];
</script>

<h2 class="text-2xl uppercase mb-5">Client Config</h2>

<div class='grid grid-cols-2 gap-3 px-3'>
{#if configs.length > 0}
  {#each configs as config}
    <div class="card w-auto shadow-lg bg-base-200 mb-6 ">
      <div class="card-body">
        <h5 class="card-title">{configTitle(config)}</h5>
        <div class="mb-3">Location: {config.location ?? '—'}</div>
        <div class="card-actions justify-end">
          <a href="/practice/config/{config.location}" class="btn btn-neutral">Edit</a>
        </div>
      </div>
    </div>
  {/each}
{:else}
  <div class="col-span-2 text-center py-12 opacity-60">No client configs found.</div>
{/if}
</div>
