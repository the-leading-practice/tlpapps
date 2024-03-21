<script lang="ts">
	import FloatingLabelInput from "$lib/components/Input/FloatingLabelInput.svelte";
	import { placeholder } from "@codemirror/view";


	let theme = localStorage.theme || "system";

	const onThemeChange = ( event: Event ) => {
		const target = event.target as HTMLInputElement;

		if( target.value === 'system' ) {
			localStorage.removeItem( 'theme' );
		} else {
			localStorage.theme = target.value;
		}

		location.reload();
	}
</script>

<h2 class="text-2xl uppercase mb-5">Options</h2>

<div>
	<label class="label cursor-pointer">
    <span class="label-text">Theme</span>
    <select class="select select-bordered w-full max-w-xs" bind:value={theme} on:change={onThemeChange}>
			<option value="system">System</option>
			<option value="light">Light</option>
			<option value="dark">Dark</option>
		</select>
  </label>
	
</div>