import { sveltekit } from '@sveltejs/kit/vite';
import { optimizeDeps } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	},
  optimizeDeps: {
    exclude: [ 
      "codemirror", 
      "@codemirror/lang-sql",
      "@codemirror/theme-one-dark" 
    ]
  },
	server:{
		port: 3000,
		host: true,
		open: true
	}
});
