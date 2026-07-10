<script lang="ts">
  import SqlEditor from "$lib/components/Editor/SqlEditor.svelte";
	import FloatingLabelInput from "$lib/components/Input/FloatingLabelInput.svelte";
  import { configService } from "$lib/services/configService";
  import { edgeConfigService, type EdgeMappingRow } from "$lib/services/edgeConfigService";
  import { addToast } from "$lib/components/Toast";

  export let data: any;

  let code: string[] = [];

  // EDGE-01 — Edge (Titanium) section state. Write-only token: never bound to a
  // server-returned value, only to what the operator types this session.
  // Local mapping-row shape uses plain strings (FloatingLabelInput expects
  // string | undefined); nulls from the API are normalized to '' on load.
  interface EdgeMappingFormRow {
    ehrDoctorId: string;
    ehrCalendarId: string;
    edgeBusinessId: string;
    edgeCalendarId: string;
  }

  let edgeBusinessId: string = data?.edge?.businessId ?? '';
  let edgeToken: string = '';
  let edgeHasToken: boolean = data?.edge?.hasToken ?? false;
  let edgeSignedOff: boolean = data?.edge?.signedOff ?? false;
  let edgeDemoBusinessId: string | null = data?.edge?.demoBusinessId ?? null;
  let edgeMappings: EdgeMappingFormRow[] = (data?.edgeMappings ?? []).map((m: EdgeMappingRow) => ({
    ehrDoctorId: m.ehrDoctorId ?? '',
    ehrCalendarId: m.ehrCalendarId ?? '',
    edgeBusinessId: m.edgeBusinessId ?? '',
    edgeCalendarId: m.edgeCalendarId ?? '',
  }));

  const addMappingRow = () => {
    edgeMappings = [...edgeMappings, { ehrDoctorId: '', ehrCalendarId: '', edgeBusinessId: '', edgeCalendarId: '' }];
  };

  const removeMappingRow = (idx: number) => {
    edgeMappings = edgeMappings.filter((_, i) => i !== idx);
  };

  const saveEdge = async () => {
    scrollTo( 0, 0 );
    const location = data.config.location;

    const body: { businessId?: string | null; token?: string; signedOff?: boolean; enabled?: boolean } = {
      businessId: edgeBusinessId,
      signedOff: edgeSignedOff,
    };
    // Never send the token field when empty — avoids clobbering the stored token.
    if (edgeToken) body.token = edgeToken;

    const savedEdge = await edgeConfigService.saveEdge( location, body );
    edgeHasToken = savedEdge.hasToken;
    edgeToken = '';

    const validMappings = edgeMappings.filter((m) => m.ehrCalendarId && m.edgeBusinessId);
    if (validMappings.length > 0) {
      await edgeConfigService.saveMappings( location, validMappings );
    }

    addToast( {
      id: 0,
      type: "success",
      dismissible: true,
      timeout: 5000,
      message: `Successfully Saved Edge Config`
    } );
  }

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
      message: `Successfully Saved ${data.config.name ?? data.config.location ?? ''} Config`
    } );
  }

</script>

{#if data && data.config}
<h2 class="text-xl uppercase font-bold">{data.config.name ?? data.config.config?.Software ?? data.config.location ?? 'Client'} Configuration</h2>
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

<div class="card bg-base-200 mx-5 mb-6 p-6">
  <h3 class="text-lg uppercase font-bold mb-4">Edge (Titanium)</h3>

  <FloatingLabelInput name="edgeBusinessId" label="Edge Business ID" placeholder="Edge Business ID" bind:value={edgeBusinessId} />

  <div class="mb-2">
    <FloatingLabelInput name="edgeToken" label="Edge Token (olx_...)" placeholder="Enter olx_ token to set/replace" bind:value={edgeToken} />
    {#if edgeHasToken}
      <span class="badge badge-success">Token set</span>
    {:else}
      <span class="badge badge-ghost">No token</span>
    {/if}
  </div>

  <div class="mb-6 pl-6 w-[320px]">
    <label class="label cursor-pointer">
      <span class="label-text">Edge Signed Off</span>
      <input type="checkbox" class="toggle toggle-accent" bind:checked={edgeSignedOff} />
    </label>
    <span class="text-xs dark:text-gray-400">Real-location Edge writes require sign-off. Until signed off, writes target the demo business only.</span>
  </div>

  <div class="mb-4">
    <span class="label-text">Demo Business ID (read-only)</span>
    <div class="dark:text-gray-400">{edgeDemoBusinessId ?? 'not configured'}</div>
  </div>

  <div class="mb-4">
    <h4 class="font-semibold mb-2">Edge &lt;-&gt; EHR Calendar Mapping</h4>
    {#each edgeMappings as row, idx}
      <div class="flex flex-row flex-wrap gap-3 mb-3 items-end">
        <FloatingLabelInput name={`ehrCalendarId_${idx}`} label="EHR Calendar ID" bind:value={row.ehrCalendarId} />
        <FloatingLabelInput name={`ehrDoctorId_${idx}`} label="EHR Doctor ID" bind:value={row.ehrDoctorId} />
        <FloatingLabelInput name={`edgeBusinessId_${idx}`} label="Edge Business ID" bind:value={row.edgeBusinessId} />
        <FloatingLabelInput name={`edgeCalendarId_${idx}`} label="Edge Calendar ID" bind:value={row.edgeCalendarId} />
        <button class="btn btn-sm btn-error" on:click={() => removeMappingRow(idx)}>Remove</button>
      </div>
    {/each}
    <button class="btn btn-sm btn-neutral" on:click={addMappingRow}>Add Mapping</button>
  </div>

  <div>
    <button class="btn btn-neutral" on:click={saveEdge}>Save Edge Config</button>
  </div>
</div>
{/if}