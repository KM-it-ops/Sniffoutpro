import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'apps/*', mode: 'folder' },
        { type: 'package', pattern: 'packages/*', mode: 'folder' },
        { type: 'feature', pattern: 'apps/web/src/features/*', mode: 'folder', capture: ['featureName'] },
      ],
      'boundaries/ignore': ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'app', allow: ['package'] },
            { from: 'package', allow: ['package'] },
            {
              from: 'feature',
              allow: ['package'],
              disallow: ['feature'],
              message: 'Features cannot import other features (FSD boundary)',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['**/dist/**', '**/.next/**', '**/target/**', '**/node_modules/**', '**/*.config.js', '**/*.config.ts', '**/coverage/**'],
  },
);
