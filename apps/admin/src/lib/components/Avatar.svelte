<script lang="ts">
	import { createEventDispatcher } from "svelte";
	import type { CssClasses } from "..";
  
  const dispatch = createEventDispatcher();

  export let name: string = "";
  export let image: string = "";
	export let rounded: boolean = true;

  export let width: CssClasses = "w-12";
	export let classes: CssClasses = "";
  export let background: CssClasses = "bg-gray-400";
  export let textColor: CssClasses = 'text-black';
  export let font: CssClasses = 'font-oxygen';
  export let margin: CssClasses = '';
  export let padding: CssClasses = '';
  export let border: CssClasses = '';

  const handleClick = () => {
    dispatch( "click" );
  }

  const avatarBase = `cursor-pointer`;
  const avatarBackgroundBase = `w-full h-full ${rounded && 'rounded-full'}`; // could not get flex directives to center the text
  const avatarTextBase = 'text-center block @[32px]:text-base @[48px]:text-3xl @[64px]:text-4xl mt-[50%] -translate-y-[50%]';
  const avatarImageBase = '';

  $: avatarClasses = `${avatarBase} ${margin} ${width} ${classes}`;
  $: avatarBackgroundClasses = `${avatarBackgroundBase} ${background} ${textColor} ${font} ${padding} ${border} ${$$props.class ?? ''}`;
  $: avatarTextClasses = `${avatarTextBase}`;
  $: avatarImageClasses = `${avatarImageBase}`;

</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="avatar {avatarClasses}" on:click={handleClick}>
  <div class="@container {avatarBackgroundClasses}">
    {#if image.length === 0}
      <span class="avatar-text {avatarTextClasses}">{name[0]}</span>
    {:else}
      <img src={image} alt="avatar" class="{avatarImageClasses}" />
    {/if}
  </div>
</div>
