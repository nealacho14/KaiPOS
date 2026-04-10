import base from './base.js';

export default [
  ...base,
  {
    files: ['**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];
