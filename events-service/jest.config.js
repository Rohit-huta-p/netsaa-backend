module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  testMatch: ['**/*.test.ts'],
  testTimeout: 30000,
  // uuid@13 is ESM-only and breaks CommonJS ts-jest at import time. Map it to a
  // CJS shim for tests only (it reaches the graph via eventRegistrationController).
  moduleNameMapper: {
    '^uuid$': '<rootDir>/src/tests/__mocks__/uuid.ts',
  },
};
