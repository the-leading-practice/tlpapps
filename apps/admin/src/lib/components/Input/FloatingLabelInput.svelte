<script lang="ts">
	export let type: string = 'input';
  export let name: string = '';
  export let placeholder: string = '';
  export let label: string = 'Label';
  export let value: string = '';
  export let required: boolean = false;

  // TODO add class style binding here
  export let width: string = "w-full";

	const handleInput = ( event: any ) => {
		value = (event.target as HTMLInputElement).value;
	}
	
</script>

<div class="floating-label">
  <div class="w-full {$$slots.combo && "join"}">
    <div class="w-full">
      <input 
        type={type}
        name={name} 
        class="input input-bordered floating-label__input {width} {$$slots.combo && "join-item"}" 
        placeholder={placeholder}
        on:input={handleInput} 
        {value}
        {required} />
      <label for={name} class="floating-label__label" data-content={label}>
        <span class="hidden--visually">{label}</span>
      </label>
    </div>
    {#if $$slots.combo}
      <slot name="combo" />
    {/if}
  </div>
  
</div>

<style>
  /*TODO convert to TailwindCSS*/
  .floating-label {
    margin-bottom: 1rem;
    transition: background-color 0.2s ease;
    border-top-left-radius: 4px;
    border-top-right-radius: 4px;
  }

  .floating-label:hover,
  .floating-label:focus-within {
  }

  .floating-label__input {
    padding: 1.8rem 1rem 0.6rem;
    font-size: 1rem;
    transition: border-color 0.2s ease;
  }

  .floating-label:hover .floating-label__input {
  }

  .floating-label__input::placeholder {
    color: rgba(0, 0, 0, 0);
  }

  .floating-label__label {
    display: block;
    position: relative;
    max-height: 0;
    font-weight: 500;
    pointer-events: none;
  }

  .floating-label__label::before {
    content: attr(data-content);
    display: inline-block;
    filter: blur(0);
    backface-visibility: hidden;
    transform-origin: left top;
    transition: transform 0.2s ease;
    left: 1rem;
    position: relative;
  }

  .floating-label__label::after {
    bottom: 1rem;
    content: "";
    height: 0.1rem;
    position: absolute;
    transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1),
      opacity 180ms cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s ease;
    opacity: 0;
    left: 0;
    top: 100%;
    margin-top: -0.1rem;
    transform: scale3d(0, 1, 1);
    width: 100%;
    
  }

  .floating-label__input:focus + .floating-label__label::after {
    transform: scale3d(1, 1, 1);
    opacity: 1;
  }

  .floating-label__input:placeholder-shown + .floating-label__label::before {
    transform: translate3d(0, -2.2rem, 0) scale3d(1, 1, 1);
  }

  .floating-label__label::before,
  .floating-label__input:focus + .floating-label__label::before {
    transform: translate3d(0, -2.8rem, 0) scale3d(0.82, 0.82, 1);
  }

  .floating-label__input:focus + .floating-label__label::before {
    color: #08ee00;
  }

  .hidden--visually {
    border: 0;
    clip: rect(1px 1px 1px 1px);
    clip: rect(1px, 1px, 1px, 1px);
    height: 1px;
    margin: -1px;
    overflow: hidden;
    padding: 0;
    position: absolute;
    width: 1px;
  }
</style>
