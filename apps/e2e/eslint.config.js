import node from '@kaipos/eslint-config/node';

export default [
  ...node,
  {
    languageOptions: {
      globals: {
        cy: 'readonly',
        Cypress: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        beforeEach: 'readonly',
        after: 'readonly',
        afterEach: 'readonly',
        expect: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-namespace': 'off',
    },
  },
];
