import baseConfig from '@sniffoutpro/config/eslint';

export default [...baseConfig, { ignores: ['.next/**', 'playwright-report/**', 'next-env.d.ts', 'e2e/**'] }];
