<script lang="ts">
	import type { CssClasses } from "$lib";

	export let label = '';
	export let name = '';
	export let checked = false;

  export let labelClass: CssClasses = '';
  export let toggleClass: CssClasses = '';
  export let textClass: CssClasses = '';


  let baseClass = 'form-control';
  let labelBaseClass = 'label cursor-pointer';
  let textBaseClass = 'label-text';
  let toggleBaseClass = 'toggle'

  $: classesContainer = `${baseClass} ${$$props.class ?? ''}`;
  $: classesLabel = `${labelBaseClass} ${labelClass}`;
  $: classesText = `${textBaseClass} ${textClass}`
  $: classesToggle = `${toggleBaseClass} ${toggleClass}`;
</script>

<div class="{classesContainer}">
	<label class="{classesLabel}">
		<span class="{classesText}">{label}</span>
		<input type="checkbox" name={name} class="{classesToggle}" bind:checked={checked} />
	</label>
</div>