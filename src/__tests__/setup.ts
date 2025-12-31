/**
 * Jest test setup file
 */

// Mock environment variables for testing
process.env.TEST_MODE = 'true';
process.env.LOG_LEVEL = 'error';

// Suppress console output during tests
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'info').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});
