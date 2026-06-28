// CommonJS-friendly shim for the ESM-only `uuid` v13 package.
// ts-jest runs tests in CommonJS, but uuid@13 ships pure ESM (`export {...}`),
// which Jest cannot parse. This shim is wired via `moduleNameMapper` in
// jest.config.js so any `import { v4 } from 'uuid'` in the import graph
// resolves to a working CJS implementation during tests only.
import { randomUUID } from 'crypto';

export const v4 = (): string => randomUUID();

export default { v4 };
