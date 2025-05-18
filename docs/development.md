# Development Guide

This document provides guidance for developers working on the Business Registration Assistant extension.

## Form Detection Logic

The core of the extension relies on its ability to detect business registration forms. Here's how the detection system works and how to extend it.

### Detection Algorithm

The form detection algorithm in `content.js` uses multiple signals to determine whether the current page is a business registration form:

1. **URL Analysis**: Examines the domain and path for government websites and registration-related patterns
2. **Content Analysis**: Scans page text for business registration terminology
3. **Form Element Analysis**: Evaluates form fields for patterns typical in business registration forms

Each analysis produces a confidence score, which is then weighted to calculate an overall confidence score for the page.

### Extending State Detection

To add support for additional states:

1. Add state-specific patterns to the `getStatePatterns()` method in `FormDetectionController`
2. Create a new state knowledge file in `/knowledge/states/[state_code].json`
3. Update any UI components that reference states (if necessary)

Example state pattern addition:

```javascript
getStatePatterns() {
  return {
    // Existing states...
    
    'WA': [
      'washington secretary of state',
      'wa secretary of state',
      'washington business portal',
      'washington corporations division',
      'washington llc'
    ],
    // Add more states here
  };
}
```

### Improving Form Field Detection

The form field detection logic can be extended by adding patterns to the `getFormFieldPatterns()` method. Each category contains patterns that match field names, IDs, labels, or placeholders.

Example field pattern addition:

```javascript
getFormFieldPatterns() {
  return {
    // Existing categories...
    
    'tax_information': [
      'tax id',
      'ein',
      'employer identification',
      'federal tax',
      'state tax',
      'tax classification'
    ],
    // Add more categories here
  };
}
```

### Testing Form Detection

To test form detection:

1. Load the extension in developer mode
2. Navigate to a business registration form
3. Open the extension's debug panel (click the =à icon in the panel footer)
4. Review the detection scores and details

For more systematic testing, create test cases with URLs of known business registration forms and expected detection results.

## Knowledge Base Structure

The `/knowledge` directory contains structured information about states and entity types.

### State Knowledge Files

State knowledge files (`/knowledge/states/[state_code].json`) follow this structure:

```json
{
  "state_code": "XX",
  "state_name": "State Name",
  "business_registration": {
    "governing_agency": "Agency name",
    "website": "Main website URL",
    "urls": { /* Important URLs */ },
    "forms": { /* Entity-specific form information */ },
    "requirements": { /* State-specific requirements */ },
    "additional_filings": { /* Additional registrations needed */ }
  },
  "form_field_guidance": {
    "common_fields": { /* Help text for common fields */ }
  }
}
```

### Entity Type Knowledge

The entity type knowledge file (`/knowledge/entities/entity_types.json`) contains information about different business structures, their advantages, disadvantages, and filing requirements.

## Adding UI Components

The extension UI uses standard HTML, CSS, and JavaScript. To add new components:

1. Create component HTML in the appropriate file (usually `panel.html`)
2. Add corresponding styles to `panel.css`
3. Implement functionality in `panel.js`
4. For reusable components, consider placing them in `/extension/ui/components/`

## Communication Architecture

The extension uses Chrome's messaging API for communication between different components:

- **Content Script ’ Background Script**: Detection results, form interaction events
- **Background Script ’ Content Script**: Commands for form analysis, field help
- **Popup ’ Background Script**: Requests for current state, profile management
- **Background Script ’ Popup**: Current detection state, stored profiles

Example message structure:

```javascript
// Sending a message from content script to background
chrome.runtime.sendMessage({
  action: 'formDetectionResult',
  detectionResult: result
});

// Receiving a message in the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'formDetectionResult') {
    // Handle form detection result
  }
});
```

## Building the Extension

Currently, the extension is loaded directly from the source files in developer mode. For production distribution, package the extension directory as a ZIP file and upload it to the Chrome Web Store.

A build script will be added in a future update to automate this process and implement minification, bundling, and other optimizations.

## Future Development Plans

- **Backend Integration**: Add API connection for more advanced form analysis
- **Multi-browser Support**: Extend to Firefox, Safari, and Edge
- **Form Auto-fill**: Implement intelligent form filling capabilities
- **User Profiles**: Save business information for reuse across different forms
- **PDF Support**: Add ability to detect and assist with PDF registration forms