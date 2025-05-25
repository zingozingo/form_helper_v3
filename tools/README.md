# State Configuration Tools

This directory contains tools for managing and validating state configurations for the Business Registration Assistant.

## Available Tools

### 1. validateState.js
Validates state JSON configuration files to ensure they meet requirements.

**Usage:**
```bash
# Validate a single state
node tools/validateState.js knowledge/states/california.json

# Validate all states
node tools/validateState.js --all
```

**Features:**
- Validates required fields (name, abbreviation, sosUrl, etc.)
- Checks URL format and regex patterns
- Validates field mapping structure
- Verifies entity type configurations
- Provides detailed error messages and warnings

### 2. generateStateTemplate.js
Interactive tool to create new state configuration templates.

**Usage:**
```bash
node tools/generateStateTemplate.js
```

**Features:**
- Interactive prompts for state information
- Generates complete configuration structure
- Creates entity type templates (LLC, Corporation, NonProfit)
- Sets up common field mappings
- Includes validation rules template

### 3. testStateDetection.js
Tests state detection accuracy and provides improvement suggestions.

**Usage:**
```bash
# Test with default URLs from configuration
node tools/testStateDetection.js knowledge/states/california.json

# Test with specific URLs
node tools/testStateDetection.js knowledge/states/california.json "https://bizfile.sos.ca.gov/forms/llc"
```

**Features:**
- Tests URL pattern matching
- Validates field detection configuration
- Checks entity type detection
- Calculates confidence scores
- Generates coverage reports
- Provides improvement suggestions

## Example Workflow

1. **Create a new state configuration:**
   ```bash
   node tools/generateStateTemplate.js
   # Follow prompts to create texas.json
   ```

2. **Validate the configuration:**
   ```bash
   node tools/validateState.js knowledge/states/texas.json
   ```

3. **Test detection accuracy:**
   ```bash
   node tools/testStateDetection.js knowledge/states/texas.json
   ```

4. **Validate all states before committing:**
   ```bash
   node tools/validateState.js --all
   ```

## Configuration Structure

State configurations should include:

- **Basic Information**: name, abbreviation, sosUrl
- **URL Patterns**: Regular expressions for form detection
- **Entity Types**: LLC, Corporation, NonProfit configurations
- **Field Mappings**: Selectors for form fields
- **Validation Rules**: Pattern matching and error messages

## Best Practices

1. Always validate configurations after editing
2. Test with real form URLs when possible
3. Keep selectors generic but specific enough to match correctly
4. Document any state-specific quirks in the configuration
5. Update lastUpdated field when making changes