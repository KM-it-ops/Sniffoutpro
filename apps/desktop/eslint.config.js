import baseConfig from '@sniffoutpro/config/eslint';

export default [
  ...baseConfig,
  {
    ignores: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
];
