import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/src/tests/**/*.test.ts'],
    setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/server.ts',
        '!src/tests/**',
    ],
    testTimeout: 30000,
    silent: true,
};

export default config;
