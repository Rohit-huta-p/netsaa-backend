import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/src/tests/**/*.test.ts'],
    setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
        '^.+\\.js$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/server.ts',
        '!src/tests/**',
    ],
    testTimeout: 30000,
    silent: true,
    // uuid v13+ ships ESM-only; transform it so Jest (CJS) can consume it
    transformIgnorePatterns: [
        '/node_modules/(?!uuid)',
    ],
};

export default config;
