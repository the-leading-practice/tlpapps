<script lang="ts">
  import { Button, ButtonGroup, Input, Heading, InputAddon, Label } from 'flowbite-svelte';
  import { Eye, EyeSlash } from 'svelte-heros-v2';

  let showP = false;
  let showC = false;

  let email: string = '';
  let password: string = '';
  let confirmPassword: string = '';

  let error;

  function validatePassword( password: string, confirmPassword: string ) {
    return confirmPassword !== password 
  }

</script>
<form method="POST" class="space-y-5 {$$props.class}">
  <Heading tag="h3">Register for an Account</Heading>
  <Label for="email">Email</Label>
  <Input id="email" name="email" type="email" class="w-full" bind:value={email} />

  <Label for="firstName">First Name</Label>
  <Input id="firstName" name="firstName" type="text" class="w-full" bind:value={email} />

  <Label for="lastName">Last Name</Label>
  <Input id="lastName" name="lastName" type="text" class="w-full" bind:value={email} />

  <Label for="password">Password</Label>
  <ButtonGroup class="w-full">
    <Input id="password" name="password" type={showP ? "text" : "password"} class="w-full" bind:value={password} />
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

  <Label for="confirm">Confirm Password</Label>
  <ButtonGroup class="w-full">
    <Input id="confirm" name="confirm" type={showC ? "text" : "password"} class="w-full" bind:value={confirmPassword} />
    <InputAddon class="p-0">
      <Button on:click={ ()=>(showC = !showC) } class="bg-transparent border-none dark:bg-transparent">
        {#if showC}
          <Eye size="24" />
        {:else}
          <EyeSlash size="24" />
        {/if}
      </Button>
    </InputAddon>
    
  </ButtonGroup>

  {#if confirmPassword !== "" && confirmPassword !== password}
    <p class="text-red-600 text-sm font-semibold">Password do not match</p>
  {:else if confirmPassword === ""}
    <p class="text-red-600 text-sm font-semibold">&nbsp</p>
  {:else}
    <p class="text-green-400 text-sm font-semibold">Password match</p>
  {/if}
  <Button class="w-full" type="submit" disabled="{validatePassword(password, confirmPassword)}">Sign Up</Button>
</form>

<style>
  input:autofill,
  input:autofill:focus,
  input:-webkit-autofill,
  input:-webkit-autofill:focus {
    -webkit-box-shadow: 0 0 0px 1000px transparent inset;
  }
</style>