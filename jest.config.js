module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/__tests__/**',
    '!src/index.js', // Exclude main entry point
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};
