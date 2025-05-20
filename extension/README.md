# Business Registration Assistant

A simple Chrome extension that detects business registration forms on websites and provides basic assistance.

## Project Structure

This project has a clean, simplified structure:

- **docs/**: Documentation for the extension
- **knowledge/**: Knowledge base data for business registration forms
- **extension/**: The main extension code
  - manifest.json: Extension configuration
  - content.js: Form detection script
  - background.js: Background service worker
  - popup.html/css/js: Popup UI files
  - modules/: Modular functionality
    - urlDetector.js: URL analysis module
    - fieldDetector.js: Form field detection module
  - icons/: Extension icons

## Features

- Detects business registration forms on websites
- Shows detection status in extension popup
- Identifies state (when possible)
- Displays confidence score
- Detects form fields and extracts their attributes
- Analyzes form field types and labels
- Simple UI for form assistance options

## Installation

1. In Chrome, go to `chrome://extensions/`
2. Enable "Developer mode" with the toggle in the top-right corner
3. Click "Load unpacked" and select the `extension` directory
4. The extension is now installed and ready to use

## Usage

1. Visit a business registration website (government sites work best)
2. The extension icon will show a checkmark if a form is detected
3. Click the extension icon to see detection details
4. Use the "Check Again" button if needed

## Technical Details

The extension uses a simple detection algorithm that analyzes:
- URL patterns (government domains, business-related terms)
- Page content (business entity terms, registration phrases)
- Form elements (fields related to business registration)

The detection result includes:
- Whether it's a business registration form
- Confidence score (0-100%)
- State identification (if possible)
- Detailed scores for different aspects of the analysis

### Field Detection

The extension includes a field detection module that:
- Identifies all input elements on forms (input, select, textarea)
- Extracts field attributes (type, name, id, value, etc.)
- Finds associated labels using various techniques
- Provides methods to query fields by type, name pattern, or label pattern
- Logs field information to the console for development and debugging

This is a modular implementation focused on reliability and extensibility.