# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Business Registration Assistant - A Chrome Extension (Manifest V3) that detects and assists with business entity registration forms on government websites.

## Development Commands
- **Install Extension**: Load unpacked from `extension/` directory via chrome://extensions/ (Developer mode ON)
- **Reload Extension**: Click refresh button in chrome://extensions/ after changes
- **Test**: Visit supported state sites (CA: bizfileOnline.sos.ca.gov, DE: icis.corp.delaware.gov, DC: dcra.dc.gov, etc.)
- **Run Tests**: `npm test` (for URL detector tests)
- **No build process**: Direct JavaScript modules, edit files and reload extension

## Architecture
### Core Extension Files
- `content.js`: Main form detection logic, injects UI elements into pages
- `background.js`: Service worker for state management and tab coordination
- `popup.js/html`: Extension popup interface
- `panel.js/html`: Side panel with form assistance features

### Detection System (`modules/`)
- `urlDetector.js`: Analyzes URLs for business registration patterns
- `fieldDetector.js`: Detects form fields and calculates confidence scores
- Multi-faceted detection: URL patterns + content analysis + field detection

### Knowledge Base Structure (`knowledge/`)
- `entities/entity_types.json`: Business entity type definitions
- `states/*.json`: State-specific requirements and information
  - **Hardcoded States**: California, Delaware (comprehensive form mappings)
  - **Template States**: DC and others (flexible JSON-based system)

### Key Features
- Form detection with confidence scoring (0-100)
- State identification (supports all US states via hybrid system)
- Error handling with user notifications
- Side panel UI with form guidance
- Auto-fill capabilities for supported forms

## Hybrid State System

### Overview
The extension uses a hybrid approach for state knowledge:
1. **Hardcoded States** (CA, DE): Full form field mappings and complex logic
2. **Template States** (DC, others): JSON-based configuration for rapid expansion

### Adding New States
1. Create JSON file in `knowledge/states/{state}.json`
2. Update URL patterns in `extension/modules/urlDetector.js`
3. Test on actual state website
4. Submit PR with screenshots

### State JSON Structure
```json
{
  "state": "State Name",
  "abbreviation": "XX",
  "entity_types": {
    "llc": {
      "name": "Limited Liability Company",
      "form_number": "FORM-123",
      "fee": "$100",
      "processing_time": "5-7 business days"
    }
  },
  "urls": {
    "main": "https://state.gov/business",
    "search": "https://state.gov/search"
  },
  "filing_methods": ["online", "mail"],
  "expedited_available": true
}
```

## Testing Commands

### URL Detection Tests
```bash
# Run all tests
npm test

# Run specific test file
npm test -- urlDetector.test.js

# Watch mode for development
npm test -- --watch
```

### Manual Testing Checklist
1. Load extension in Chrome
2. Navigate to state website
3. Verify state detection in popup
4. Check form detection confidence
5. Test auto-fill functionality
6. Verify error handling

## Important Implementation Details
- Uses Chrome Extension Manifest V3 (service workers, not persistent background pages)
- Message passing between content scripts, background, and UI components
- Error boundaries with graceful fallbacks
- No external dependencies for core functionality
- Lazy loading of state data for performance

## State Addition Process

### Quick Start
1. Copy `knowledge/states/dc.json` as template
2. Update with your state's information
3. Add URL patterns to detector
4. Test and submit PR

### Required Information
- Official entity type names
- Current form numbers
- Filing fees (must be current)
- Processing times
- Main state business URL

### Testing Requirements
- Screenshots of extension working on state site
- All automated tests passing
- Manual verification of form filling
- Documentation of any limitations

## Common Issues & Solutions

### Form Detection Not Working
- Check URL patterns in urlDetector.js
- Verify form field selectors
- Look for dynamic content loading
- Check browser console for errors

### State Not Recognized
- Ensure URL pattern is specific enough
- Check for typos in state configuration
- Verify JSON file is valid
- Test pattern matching with unit tests

### Auto-Fill Issues
- Form fields may have changed
- Check for iframe restrictions
- Verify field name/id selectors
- Some states may need custom logic