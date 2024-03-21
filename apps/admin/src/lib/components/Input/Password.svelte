<script lang="ts">
  import Icon from '@iconify/svelte';
	import FloatingLabelInput from './FloatingLabelInput.svelte';

  export let name: string;
  export let value: string = '';
  let pwType: string = "password";

  const handleInput = ( event: any ) => {
    if( event.target ) {
			value = (event.target as HTMLInputElement).value;   
    }
  }

  const toggleShowP = ( event: MouseEvent ) => {
    event.preventDefault();
    pwType = pwType === "password" ? "text" : "password";
  }
</script>

<FloatingLabelInput type={pwType} label="Password" name={name}>
  <button on:click={ toggleShowP } class="btn btn-neutral join-item w-[50px]" slot="combo">
    {#if pwType==="password"}
      <Icon icon="mdi:eye" />
    {:else}
      <Icon icon="mdi:eye-off" />
    {/if}
  </button>
</FloatingLabelInput>