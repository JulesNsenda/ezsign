module.exports = {
  // Use ts-jest preset for TypeScript
  preset: 'ts-jest',

  // Test environment
  testEnvironment: 'node',

  // Root directory
  roots: ['<rootDir>/src'],

  // Test match patterns
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],

  // Transform files with ts-jest
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/main.ts',
    '!src/server.ts',
  ],

  coverageDirectory: 'coverage',

  coverageReporters: ['text', 'lcov', 'html'],

  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  // Module name mapper for path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@routes/(.*)$': '<rootDir>/src/routes/$1',
    '^@jobs/(.*)$': '<rootDir>/src/jobs/$1',
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks between tests
  restoreMocks: true,

  // Reset mocks between tests
  resetMocks: true,

  // Verbose output
  verbose: true,

  // Detect open handles
  detectOpenHandles: true,

  // Force exit after tests complete
  forceExit: true,

  // Test timeout
  testTimeout: 10000,

  // Globals
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    },
  },
};
