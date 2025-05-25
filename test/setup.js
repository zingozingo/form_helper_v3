// Test setup file - runs before each test suite

// Mock chrome API if not already mocked
if (!global.chrome) {
  global.chrome = {
    runtime: {
      getURL: jest.fn((path) => `chrome-extension://test/${path}`),
      sendMessage: jest.fn(),
      onMessage: {
        addListener: jest.fn()
      }
    },
    storage: {
      local: {
        get: jest.fn(),
        set: jest.fn()
      }
    }
  };
}

// Mock performance API if needed
if (!global.performance) {
  global.performance = {
    now: () => Date.now()
  };
}

// Add custom matchers
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});