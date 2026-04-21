/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  passWithNoTests: true,
  globals: {
    'ts-jest': {
      isolatedModules: true,
    },
  },
};
