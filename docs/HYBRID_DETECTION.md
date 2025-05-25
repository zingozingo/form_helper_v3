# Hybrid Detection System

## Overview

The Business Registration Assistant now uses a hybrid detection approach that combines:
- Common patterns that work across all states
- State-specific patterns that override or enhance common patterns
- Dynamic knowledge loading based on identified state
- Graceful fallback for unknown states

## Architecture

### 1. Knowledge Loader (`knowledge/knowledgeLoader.js`)

The central component that manages pattern loading and merging:

```javascript
class KnowledgeLoader {
  // Loads common patterns on initialization
  async initialize()
  
  // Loads state-specific data when needed
  async loadStateData(stateCode)
  
  // Returns merged field patterns with proper precedence
  async getFieldPatterns(stateCode)
  
  // Returns URL patterns for state detection
  async getUrlPatterns(stateCode)
  
  // Gets entity types for a specific state
  async getEntityTypes(stateCode)
  
  // Identifies state from URL
  identifyStateFromUrl(url)
  
  // Calculates confidence score for field matches
  getFieldConfidence(fieldType, matchContext)
}
```

### 2. Field Detector Updates

The field detector now:
- Accepts state context during initialization
- Loads appropriate patterns based on state
- Provides confidence scores based on pattern matching
- Falls back to common patterns when state-specific data unavailable

```javascript
// Create detector with state context
const detector = new FieldDetector(document, { state: 'CA' });

// Detect fields with state-aware patterns
const fields = await detector.detectFields();

// Update state context dynamically
await detector.updateState('NY');
```

### 3. URL Detector Updates

The URL detector now:
- Uses common government patterns by default
- Applies state-specific URL patterns when available
- Provides better state identification from URLs
- Works asynchronously for pattern loading

```javascript
// Initialize detector
await URLDetector.initialize();

// Analyze URL with state awareness
const analysis = await URLDetector.analyzeUrl(url);

// State will be auto-detected from URL
console.log(analysis.state); // 'CA', 'NY', etc.
```

## Pattern Structure

### Common Patterns (`knowledge/common/patterns.json`)

```json
{
  "field_patterns": {
    "business_name": {
      "patterns": ["business.*name", "company.*name"],
      "priority": 90,
      "attributes": ["business", "company"],
      "validation": "text"
    }
  },
  "url_patterns": {
    "government": ["\\.gov", "\\.us"],
    "business_registration": ["business", "entity", "register"]
  }
}
```

### State-Specific Patterns (`knowledge/states/[state].json`)

```json
{
  "state": {
    "code": "CA",
    "name": "California"
  },
  "field_mappings": {
    "business_name": {
      "patterns": ["entity.*name", "legal.*entity.*name"],
      "stateSpecific": true
    }
  },
  "url_patterns": {
    "primary": ["bizfile.sos.ca.gov", "businesssearch.sos.ca.gov"]
  }
}
```

## Pattern Precedence

1. **State-specific patterns** take precedence over common patterns
2. **Higher priority scores** override lower ones
3. **Multiple pattern matches** increase confidence
4. **Exact matches** boost confidence significantly

## Benefits

1. **Scalability**: Easy to add new states without changing core logic
2. **Maintainability**: Patterns are data-driven, not hard-coded
3. **Flexibility**: Can handle unknown states gracefully
4. **Accuracy**: State-specific patterns improve detection accuracy
5. **Performance**: Only loads necessary state data when needed

## Adding New States

1. Create a new JSON file in `knowledge/states/[state].json`
2. Define state-specific patterns following the structure
3. Test with state-specific forms
4. No code changes required!

## Fallback Behavior

When state-specific data is unavailable:
1. System uses common patterns
2. Detection still works with reduced accuracy
3. No errors or failures
4. User experience remains consistent

## Future Enhancements

1. **Machine Learning**: Learn from user interactions to improve patterns
2. **Pattern Versioning**: Track pattern effectiveness over time
3. **A/B Testing**: Test different pattern sets for optimization
4. **Community Patterns**: Allow users to contribute patterns
5. **Pattern Analytics**: Track which patterns are most effective