import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const noOnlyTestsRule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow .only/.skip/xit/xdescribe in tests' },
    schema: [],
    messages: {
      noOnly: 'Do not commit `{{name}}` — it disables tests in CI.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (
          node.property.type === 'Identifier' &&
          (node.property.name === 'only' || node.property.name === 'skip') &&
          node.object.type === 'Identifier' &&
          ['it', 'test', 'describe'].includes(node.object.name)
        ) {
          context.report({
            node,
            messageId: 'noOnly',
            data: { name: `${node.object.name}.${node.property.name}` },
          });
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          ['xit', 'xtest', 'xdescribe'].includes(node.callee.name)
        ) {
          context.report({ node, messageId: 'noOnly', data: { name: node.callee.name } });
        }
      },
    };
  },
};

const noConsoleInSrcRule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow console.log in apps/ and packages/ src' },
    schema: [],
    messages: { noConsole: 'No console.log in src — use a structured logger.' },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (
          node.object.type === 'Identifier' &&
          node.object.name === 'console' &&
          node.property.type === 'Identifier' &&
          node.property.name === 'log'
        ) {
          context.report({ node, messageId: 'noConsole' });
        }
      },
    };
  },
};

const localPlugin = {
  rules: {
    'no-only-tests': noOnlyTestsRule,
    'no-console-in-src': noConsoleInSrcRule,
  },
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/build/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/generated/**',
      'pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs,cjs,js,jsx}'],
    plugins: { local: localPlugin },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'local/no-only-tests': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    ignores: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/scripts/**',
      '**/seed.ts',
    ],
    rules: {
      'local/no-console-in-src': 'error',
    },
  },
  {
    files: ['**/*.{tsx,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
  prettier,
];
