<script lang="ts">
  import { Button, ButtonGroup, Input, Heading, InputAddon, Label } from 'flowbite-svelte';
  import { Eye, EyeSlash } from 'svelte-heros-v2';

  let showP = false;

  let email: string = '';
  let password: string = '';
</script>

<div>
  <form method="POST" class="space-y-5 {$$props.class}">
    <Heading tag="h3">User Login</Heading>
    <Label for="email">Email</Label>
    <Input id="email" name="email" type="email" class="w-full" bind:value={email} />

    <Label for="password">Password</Label>
    <ButtonGroup class="w-full">
      <Input label="Password" id="password" name="password" type={showP ? "text" : "password"} class="w-full" bind:value={password} />
      <InputAddon class="p-0">
        <Button on:click={ ()=>(showP = !showP) } class="bg-transparent border-none dark:bg-transparent">
          {#if showP}
            <Eye size="24" />
          {:else}
            <EyeSlash size="24" />
          {/if}
        </Button>
      </InputAddon>
      
    </ButtonGroup>
  
    <Button class="w-full" type="submit">Sign In</Button>

  </form>

  <div class="separator">
    <hr class=" border-gray-500 dark:border-gray-400" />
    <div class="label bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">or</div>
  </div>

  <Button class="w-full" color="light" on:click={()=>{document.location = "/sign-up"}}>Register</Button>
</div>

<style>
  .separator {
    @apply my-[20px];
    position:relative;
  }
  .separator div.label {
    position: absolute;
    display: block;
    text-align: center;
    left: 50%;
    width: 25px;
    transform: translate(-50%, -50%);
  }
</style>