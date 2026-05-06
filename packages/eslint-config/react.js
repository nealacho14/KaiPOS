import base from './base.js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';

const designSystemBoundary = {
  paths: [
    {
      name: '@mui/material',
      message: 'Importa desde @kaipos/ui en lugar de @mui/material directo.',
    },
    {
      name: 'lucide-react',
      message: 'Importa iconos desde @kaipos/ui en lugar de lucide-react directo.',
    },
  ],
  patterns: [
    {
      group: ['@mui/material/*'],
      message: 'Importa desde @kaipos/ui en lugar de @mui/material/<sub>.',
    },
  ],
};

export default [
  ...base,
  {
    files: ['**/*.tsx', '**/*.ts'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-is-valid': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
    },
  },
  // Design-system boundary: apps may not import MUI or lucide directly.
  // packages/ui itself is the only place allowed to do so.
  {
    files: ['apps/**/*.{ts,tsx}', '**/apps/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', designSystemBoundary],
    },
  },
];
