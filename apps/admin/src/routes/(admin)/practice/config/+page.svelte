<script lang="ts">
  import type { ConfigRecord } from '$lib/types/common';

  export let data: any;
  let formModal = false;
  let currentConfig: ConfigRecord;
  let patientSql: string = "";
  let apptSql: string = "";

</script>

<h2 class="text-2xl uppercase mb-5">Client Config</h2>

<div class='grid grid-cols-2 gap-3 px-3'>
{#if data.configs && data.configs.length > 0}
  {#each data.configs as config}
    <div class="card w-auto shadow-lg bg-base-200 mb-6 ">
      <div class="card-body">
        <h5 class="card-title">{config.name}</h5>
        <div class="mb-3">Location: {config.location}</div>
        <div class="card-actions justify-end">
          <a href="/practice/config/{config.location}" class="btn btn-neutral">Edit</a>
        </div>
      </div>
    </div>
  {/each}
{/if}
</div>
