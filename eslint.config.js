import baseConfig from '@sniffoutpro/config/eslint';

export default [
  ...baseConfig,
  {
    // Mirror apps/desktop's package-level ignores: its test files are excluded
    // from tsconfig, so the typed project service can't lint them from root
    // (lint-staged runs eslint with this root config).
    ignores: ['apps/desktop/src/**/*.test.ts', 'apps/desktop/src/**/*.test.tsx'],
  },
];
