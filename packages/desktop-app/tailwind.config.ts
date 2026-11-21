import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../narrative-editor/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          950: '#0b0d12',
          900: '#121620',
          800: '#1a202e',
          700: '#252d40',
        },
      },
    },
  },
  plugins: [],
};

export default config;
