<script lang="ts">
  import SqlEditor from "$lib/components/Editor/SqlEditor.svelte";
	import FloatingLabelInput from "$lib/components/Input/FloatingLabelInput.svelte";
  import { configService } from "$lib/services/configService";
  import { addToast } from "$lib/components/Toast";

  export let data: any;

  let code: string[] = [];

  if( data && data.config ) {
    data.config.config.Tables.forEach( ( t: any ) => {
      const sql = t.formattedQuery.length > 0 ? t.formattedQuery : t.SqlQuery;
      code.push( sql );
    } );
  }

  const sqlChange = ( event: any ) => {
    console.log( event );
    if( data && data.config ) {
      data.config.config.Tables[event.detail.index].formattedQuery = event.detail.detail;
      data.config.config.Tables[event.detail.index].SqlQuery = event.detail.detail.replace(/ {2}| {4}|[\t\n\r]/gm,'');

      console.log( data.config.config.Tables[event.detail.index] );
    }
  }

  const saveConfig = async () => {
    scrollTo( 0, 0 );
    const ret = await configService.updateConfig( data.config );
    addToast( {
      id: 0,
      type: "success",
      dismissible: true,
      timeout: 5000,
      message: `Successfully Saved ${data.config.name} Config`
    } );
  }

</script>

{#if data && data.config}
<h2 class="text-xl uppercase font-bold">{data.config.name} Configuration</h2>
<span class="dark:text-gray-400">Location: {data.config.location}</span>
<div class="config-body overflow-auto pt-[5px] mt-6 mx-5">
  <FloatingLabelInput name="dbProvider" label="DB Provider" placeholder="DB Provider" bind:value={data.config.config.DBProvider} />
  <FloatingLabelInput name="connectionString" label="Connection String" bind:value={data.config.config.ConnectionString} />

  <div class="mb-6 pl-6 w-[190px]">
    <label class="label cursor-pointer">
      <span class="label-text">Use Cache Table</span>
      <input type="checkbox" class="toggle toggle-accent" bind:checked={data.config.config.UseCacheTable} />
    </label>
  </div>

  <FloatingLabelInput name="authEndpoint" label="Auth Endpoint" bind:value={data.config.config.AuthEndpoint} />
  <FloatingLabelInput name="patientEndpoint" label="Patient Endpoint" bind:value={data.config.config.PatientEndpoint} />
  <FloatingLabelInput name="apptEndpoint" label="Appointment Endpoint" bind:value={data.config.config.AppointmentEndpoint} />
  <FloatingLabelInput name="notifyEndpoint" label="Notification Endpoint" bind:value={data.config.config.NotificationEndpoint} />

  
  <div class="flex flex-row flex-wrap space-x-6">
    <FloatingLabelInput name="repeat" label="Repeat (in milliseconds)" bind:value={data.config.config.RepeatMilliseconds} />
    <FloatingLabelInput name="refresh" label="Token Refresh (in milliseconds)" bind:value={data.config.config.TokenRefreshMilliseconds} />
    <FloatingLabelInput name="maxBatchSize" label="Max Batch Size" bind:value={data.config.config.MaxBatchSize} />
  </div>

{#each data.config.config.Tables as t, idx}
  <div class="text-gray-400 mb-6">{data.config.config.Tables[idx].Name} Table Configuration</div>
  <div class="flex flex-col">

    <FloatingLabelInput name="tblName" label="Table Name" bind:value={data.config.config.Tables[idx].Name} />
    <FloatingLabelInput name="tblEndpoint" label="Endpoint" bind:value={data.config.config.Tables[idx].Endpoint} />
    <FloatingLabelInput name="tblUniqueField" label="Unique Field" bind:value={data.config.config.Tables[idx].UniqueField} />
    <div class="mb-6">
      <label for={data.config.config.Tables[idx].Name+"_sql"} class="mb-2">{data.config.config.Tables[idx].Name} Sql Query</label>
      <SqlEditor name={data.config.config.Tables[idx].Name+"_sql"} index={idx} bind:value={code[idx]} on:change={sqlChange}/>
    </div>
  </div>
{/each}
</div>

<div class="mb-6">
  <button class="btn btn-neutral" on:click={saveConfig}>Save</button>
</div>
{/if}