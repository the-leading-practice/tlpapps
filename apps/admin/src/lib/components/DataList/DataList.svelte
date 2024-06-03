<script lang="ts">
	import { createEventDispatcher } from "svelte";
  import Avatar from "../Avatar/Avatar.svelte";
  import type { DataListItem } from "./types";
	import type { CssClasses } from "$lib";
	import { dataList, updateList } from "./store";
  
  export let itemList: DataListItem[];
  export let visible: boolean = false;
  export let filter: string = "";
  export let mask: string[] = [];
  let prevMaskLength: number = 0;

  export let height: CssClasses = 'h-38';
  export let width: CssClasses = "w-[86%]";
  
  let list: HTMLUListElement;

  console.log( itemList );

  const dispatch = createEventDispatcher();
  const clickHandler = ( event: MouseEvent, item: DataListItem ) => {
    console.log( `clickhandler` );
    dispatch( "select", { event, item: item} );
  }

  const listBase = "absolute list-none px-[8px] rounded bg-base-100 border border-neutral overflow-y-auto";
  const listItem = "cursor-pointer hover:bg-neutral border-b border-neutral"

  // filter the item list
  $: updateList( filter, mask, itemList );

  $: classesList = `${listBase} ${width} ${height} ${visible ? "visible" : "hidden"}`;
  $: classesItem = `${listItem}`;
</script>

{#if $dataList && $dataList.length > 0}
  <ul class="list-container {classesList}" bind:this={list}>
    {#each $dataList as item (item.index)}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <li class="list-item {classesItem}">
        <button on:click={( event )=>clickHandler( event, item )}>
          <div class="flex flex-row flex-auto px-[10px] py-[5px]">
            <div class="mr-[10px]">
              <Avatar 
                name={item.label} 
                background={item.metaData.color} 
                image={item.metaData.avatar}
                width="w-10" />
            </div>
            <div class="flex flex-col">
              <div class="text-left">{item.label}</div>
              {#if item.metaData}
                <div class="text-sm">{item.metaData.email}</div>
              {/if}
            </div>
          </div>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .list-item:last-child{
    @apply border-b-0;
  }
</style>