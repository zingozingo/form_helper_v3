# State Contribution Guide

## Overview

This guide helps contributors add new state support to the Business Registration Assistant. Each state requires a JSON configuration file and URL pattern updates.

## State Template Explanation

### Basic Structure

```json
{
  "state": "State Name",              // Full state name
  "abbreviation": "XX",               // Two-letter abbreviation
  "entity_types": {},                 // Entity type configurations
  "urls": {},                         // Important state URLs
  "filing_methods": [],               // Available filing methods
  "expedited_available": false,       // Expedited processing option
  "notes": ""                         // State-specific notes
}
```

### Entity Types Structure

```json
"entity_types": {
  "llc": {
    "name": "Limited Liability Company",
    "form_number": "LLC-1",           // Can be string or array
    "fee": "$100",                    // Current filing fee
    "processing_time": "5-7 business days",
    "expedited_fee": "$50",           // Optional
    "expedited_time": "24 hours",     // Optional
    "annual_report": {                // Optional
      "fee": "$20",
      "due_date": "Anniversary of formation"
    }
  },
  "corporation": {
    "name": "Corporation",
    "form_number": ["CORP-1", "CORP-1A"],  // Multiple forms example
    "fee": "$125",
    "processing_time": "5-7 business days"
  }
}
```

### URLs Structure

```json
"urls": {
  "main": "https://state.gov/business",          // Main business portal
  "search": "https://state.gov/business-search", // Entity search
  "forms": "https://state.gov/forms",            // Forms download page
  "filing": "https://state.gov/file",            // Online filing portal
  "help": "https://state.gov/help"               // Help/FAQ page
}
```

## Required vs Optional Fields

### Required Fields
- `state`: Full state name
- `abbreviation`: Two-letter state code
- `entity_types`: At least one entity type (LLC or Corporation)
  - For each entity type:
    - `name`: Official entity type name
    - `form_number`: Form number(s)
    - `fee`: Current filing fee
    - `processing_time`: Standard processing time
- `urls.main`: Main business registration URL
- `filing_methods`: Array with at least one method

### Optional Fields
- `urls.search`, `urls.forms`, `urls.filing`, `urls.help`
- `expedited_available` and related fees/times
- `annual_report` information
- `registered_agent_required` (defaults to true)
- `operating_agreement_required` (defaults to false for LLC)
- `ein_required` (defaults to true)
- `state_tax_id_required` (defaults to varies)
- `notes`: Additional state-specific information

## Testing Requirements

### 1. JSON Validation

```bash
# Your JSON must be valid
python -m json.tool knowledge/states/your_state.json
```

### 2. URL Detection Testing

Add test case to `urlDetector.test.js`:

```javascript
// Test your state's URL patterns
expect(detector.detectState('https://your-state.gov/business')).toBe('your_state');
```

### 3. Manual Browser Testing

1. **Load Extension**
   ```bash
   1. Open Chrome
   2. Go to chrome://extensions/
   3. Enable Developer mode
   4. Click "Load unpacked"
   5. Select extension directory
   ```

2. **Test Form Detection**
   - Navigate to state's business registration page
   - Open extension popup
   - Verify state is detected correctly
   - Check that entity types appear

3. **Test Form Filling**
   - Click "Auto Fill" button
   - Verify correct fee amounts
   - Check form numbers match
   - Ensure all fields populate correctly

### 4. Screenshot Requirements

Provide screenshots showing:
1. Extension detecting the state website
2. Entity type selection working
3. Form fields being populated
4. Any special features or considerations

## Submission Process

### 1. Fork and Branch

```bash
git fork [repository]
git checkout -b add-state-XX
```

### 2. Add State Files

```bash
# Create state JSON
edit knowledge/states/xx.json

# Update URL detector
edit extension/modules/urlDetector.js

# Add test cases
edit extension/modules/urlDetector.test.js
```

### 3. Test Thoroughly

- Run all automated tests
- Perform manual browser testing
- Document any issues or limitations

### 4. Create Pull Request

Title: `Add support for [State Name]`

Include:
- [ ] State JSON file
- [ ] URL detector updates
- [ ] Test case additions
- [ ] Screenshots of working extension
- [ ] Verification checklist (below)

### 5. PR Verification Checklist

```markdown
## Verification Checklist

- [ ] JSON validates without errors
- [ ] All required fields are present
- [ ] Fees are current (verified within last 30 days)
- [ ] Form numbers are correct
- [ ] URLs are working and correct
- [ ] Extension detects state website
- [ ] Form filling works correctly
- [ ] Tests pass locally
- [ ] Screenshots included
```

## Quality Standards

### Accuracy Requirements

1. **Current Information**
   - Fees must be verified within 30 days
   - Form numbers must be currently in use
   - Processing times should reflect current standards

2. **Source Verification**
   - Only use official state websites
   - Include source URLs in PR description
   - Note last verification date

### Completeness Standards

1. **Minimum Coverage**
   - LLC formation required
   - Corporation formation required if available
   - Basic URLs (main, search if available)

2. **Preferred Coverage**
   - All major entity types
   - Annual report information
   - Expedited options
   - Special requirements

### Code Standards

1. **JSON Formatting**
   - 2-space indentation
   - Consistent quote style
   - Alphabetical ordering where sensible

2. **URL Patterns**
   - Use most specific patterns
   - Avoid overly broad matches
   - Test against state's various subdomains

## Common Issues & Solutions

### Issue: Multiple state domains
```javascript
// Solution: Add all patterns
'state.gov': 'state_name',
'business.state.gov': 'state_name',
'sos.state.gov': 'state_name'
```

### Issue: Dynamic form numbers
```json
// Solution: Use array
"form_number": ["LLC-1", "LLC-1-EZ", "LLC-1-CA"]
```

### Issue: Complex fee structures
```json
// Solution: Use notes field
"fee": "$100",
"notes": "Additional $50 for name reservation. Counties may charge additional fees."
```

### Issue: Seasonal variations
```json
// Solution: Document in notes
"processing_time": "5-7 business days",
"notes": "Processing may take up to 30 days during peak season (January-March)"
```

## Getting Help

### Resources
- Existing state files in `knowledge/states/`
- California and Delaware as comprehensive examples
- DC as template system example

### Support Channels
- GitHub Issues for questions
- PR comments for specific feedback
- Discussions for general topics

### Response Times
- Initial PR review: 48-72 hours
- Follow-up reviews: 24-48 hours
- Merge decision: Within 1 week of final submission