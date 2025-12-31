/**
 * Jest test setup file
 * Configures the test environment before tests run
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.TEST_MODE = 'true';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests

// Suppress console output during tests
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'info').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});

// Placeholder test to satisfy Jest requirement for test files
describe('Test Setup', () => {
  it('should have test environment configured', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.TEST_MODE).toBe('true');
  });
});
