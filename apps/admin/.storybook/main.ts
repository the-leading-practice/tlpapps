import type { StorybookConfig } from '@storybook/sveltekit';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|svelte)'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-svelte-csf'],
  framework: { name: '@storybook/sveltekit', options: {} },
  docs: { autodocs: 'tag' },
};
export default config;
