# Form Helper V3 Test Suite

This directory contains comprehensive tests for the hybrid knowledge-based form detection system.

## Test Structure

### Unit Tests

1. **knowledgeLoader.test.js**
   - Tests for loading common patterns from entity_types.json
   - Tests for loading state-specific patterns
   - Tests for state identification from URLs and content
   - Tests for pattern merging logic
   - Tests for fallback behavior when states are unknown

2. **fieldDetector.test.js**
   - Tests for universal field classification
   - Tests for state-specific field overrides
   - Tests for confidence scoring algorithm
   - Tests for handling unknown/ambiguous fields
   - Performance tests for large forms

3. **hybridDetection.test.js**
   - Integration tests combining knowledge loading and field detection
   - Multi-state scenario testing
   - Unknown state handling
   - Performance tests with multiple states
   - Edge case handling

### Test Fixtures

Located in `test/fixtures/`:

1. **dc-business-registration.html**
   - Real-world example of DC business registration form
   - Tests detection of uncommon state (not CA/DE)
   - Contains DC-specific fields

2. **generic-government-form.html**
   - Generic business form without state identification
   - Tests universal pattern detection
   - Contains common business fields

3. **multi-state-form.html**
   - Complex form supporting multiple states
   - Tests state-specific section detection
   - Contains dynamic state-specific fields

4. **edge-case-form.html**
   - Comprehensive edge case testing
   - Includes: ambiguous fields, dynamic content, nested structures,
     duplicate names, custom attributes, malformed HTML

## Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm run test:knowledge
npm run test:field
npm run test:hybrid

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch

# Verbose output
npm run test:verbose
```

## Test Coverage Goals

- Minimum 80% coverage for all metrics (branches, functions, lines, statements)
- Focus on critical paths: state detection, pattern merging, field classification
- Edge case coverage for robustness

## Key Testing Scenarios

### State Detection
- Known states (CA, DE) via URL patterns
- Unknown states fallback to universal patterns
- Multi-state references handling
- Ambiguous state detection

### Field Detection
- High confidence matches (exact keywords)
- Partial matches with lower confidence
- State-specific overrides
- Unknown field handling

### Performance
- Large forms (100+ fields)
- Multiple pattern sets
- Rapid state switching
- Pattern caching

### Edge Cases
- Dynamic field addition
- Malformed HTML
- Duplicate field names
- Hidden/disabled fields
- AJAX-loaded content
- Nested structures

## Mock Data

Tests use realistic mock data that mirrors actual JSON structure:
- entity_types.json structure for common patterns
- State-specific JSON structure for overrides
- Realistic form HTML from actual government sites

## Debugging Tests

1. Use `--verbose` flag for detailed output
2. Add `console.log` statements in test code
3. Use `test.only()` to isolate specific tests
4. Check coverage reports for untested code paths

## Future Enhancements

1. Add visual regression tests for form filling
2. Add E2E tests with actual Chrome extension
3. Add performance benchmarks
4. Add tests for new states as they're added