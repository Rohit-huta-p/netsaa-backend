// Test bootstrap. Suppresses console noise, ensures clean env vars.
beforeAll(() => {
    process.env.JWT_SECRET = 'test_secret';
    process.env.LINK_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 64 hex chars = 32 bytes for AES-256
    jest.spyOn(console, 'log').mockImplementation(() => { });
    jest.spyOn(console, 'warn').mockImplementation(() => { });
    jest.spyOn(console, 'error').mockImplementation(() => { });
});

beforeEach(() => {
    jest.clearAllMocks();
});
