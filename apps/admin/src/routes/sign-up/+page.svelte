<script lang="ts">
  import SignUpForm from "$lib/components/SignUpForm/SignUpForm.svelte";
  import { Card } from 'flowbite-svelte';
</script>

<svlete:head>
  <title>Sign In</title>
</svlete:head>

<div class="sign-in-form">
  <Card>
    <SignUpForm />
  </Card>
</div>

<style>
 .sign-in-form {
    @apply absolute;
    width: 420px;
    top: 50%;
    left: 50%;
    transform: translate( -50%, -50% );
  }
</style>