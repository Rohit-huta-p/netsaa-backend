import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/tests/**/*.test.ts', '**/src/**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  globals: { 'ts-jest': { tsconfig: 'tsconfig.test.json' } },
  testTimeout: 30000,
  verbose: true,
};

export default config;
