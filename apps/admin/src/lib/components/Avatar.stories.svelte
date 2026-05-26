<script context="module">
  import Avatar from './Avatar.svelte';

  export const meta = {
    title: 'Components/Avatar',
    component: Avatar,
    tags: ['autodocs'],
    argTypes: {
      name: { control: 'text' },
      image: { control: 'text' },
      rounded: { control: 'boolean' },
      width: { control: 'text' },
      background: { control: 'text' },
      textColor: { control: 'text' }
    }
  };
</script>

<script>
  import { Story, Template } from '@storybook/addon-svelte-csf';
</script>

<Template let:args>
  <Avatar {...args} />
</Template>

<Story name="Initial" args={{ name: 'Jane Doe', width: 'w-16' }} />

<Story
  name="WithImage"
  args={{ name: 'Jane Doe', image: 'https://i.pravatar.cc/150?img=47', width: 'w-16' }}
/>

<Story
  name="Square"
  args={{ name: 'A', rounded: false, width: 'w-16', background: 'bg-indigo-500', textColor: 'text-white' }}
/>
