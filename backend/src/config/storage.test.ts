/**
 * F6: `getStorageRoot()` had no tests at all -- the highest-risk change in
 * the SEC-C2 diff, and exactly the class of defect F4/F4b describe (a
 * silent storage-root relocation). Table-driven over the four
 * FILE_STORAGE_PATH/STORAGE_PATH permutations, plus the error-once
 * behaviour. Each case does its own `jest.resetModules()` + fresh
 * `require()` because the "already logged" flag is module-level state.
 */
describe('getStorageRoot', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.FILE_STORAGE_PATH;
    delete process.env.STORAGE_PATH;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function loadModule() {
    jest.doMock('@/services/loggerService', () => ({
      __esModule: true,
      default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    }));
    const logger = jest.requireMock('@/services/loggerService').default;
    const { getStorageRoot } = jest.requireActual('./storage') as typeof import('./storage');
    return { getStorageRoot, logger };
  }

  it('defaults to ./storage when neither is set, no error logged', () => {
    const { getStorageRoot, logger } = loadModule();

    expect(getStorageRoot()).toBe('./storage');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('uses FILE_STORAGE_PATH alone, no error logged', () => {
    process.env.FILE_STORAGE_PATH = '/data/files';
    const { getStorageRoot, logger } = loadModule();

    expect(getStorageRoot()).toBe('/data/files');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('uses STORAGE_PATH alone (deprecated alias), and logs the relocation at error exactly once', () => {
    process.env.STORAGE_PATH = '/data/legacy';
    const { getStorageRoot, logger } = loadModule();

    expect(getStorageRoot()).toBe('/data/legacy');
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('STORAGE_PATH is set'),
      expect.objectContaining({ newRoot: '/data/legacy' })
    );

    // Repeated calls within the same module instance don't re-log.
    getStorageRoot();
    getStorageRoot();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('FILE_STORAGE_PATH wins when both are set to different values, and logs the divergence at error exactly once', () => {
    process.env.FILE_STORAGE_PATH = '/data/files';
    process.env.STORAGE_PATH = '/data/legacy';
    const { getStorageRoot, logger } = loadModule();

    expect(getStorageRoot()).toBe('/data/files');
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('both set'),
      expect.objectContaining({
        fileStoragePath: '/data/files',
        storagePathAlias: '/data/legacy',
      })
    );

    getStorageRoot();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('does not log when both are set to the identical value (no divergence, nothing relocates)', () => {
    process.env.FILE_STORAGE_PATH = '/data/files';
    process.env.STORAGE_PATH = '/data/files';
    const { getStorageRoot, logger } = loadModule();

    expect(getStorageRoot()).toBe('/data/files');
    expect(logger.error).not.toHaveBeenCalled();
  });
});
