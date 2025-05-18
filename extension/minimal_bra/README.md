# Minimal Business Registration Assistant Extension

This is an extremely simple, minimal implementation of the Business Registration Assistant Chrome extension. It's designed to be reliable and guaranteed to work without any advanced features or complexity.

## What It Does

- Detects business registration forms on websites using basic keyword analysis
- Shows a checkmark badge on the extension icon when a form is detected
- Displays a simple popup with detection information
- Includes minimal "Form Assistance" UI elements

## Files

All files are in a single directory:

- `manifest.json` - Basic Manifest V3 configuration with minimal permissions
- `content.js` - Simple script that detects business registration forms
- `background.js` - Minimal script that handles messaging between components
- `popup.html` - Basic popup HTML structure
- `popup.css` - Simple styling for the popup
- `popup.js` - Minimal script to display detection results
- `icon.png` - Simple placeholder icon

## Installation

1. In Chrome, go to `chrome://extensions/`
2. Enable "Developer mode" with the toggle in the top-right corner
3. Click "Load unpacked" and select the directory containing these files
4. The extension should now be installed

## How to Test

1. Visit a business registration website (e.g., a state government business registration page)
2. The extension should detect the form and show a checkmark on the icon
3. Click the extension icon to see detection details
4. Use the "Check Again" button if needed

## Notes

- This is an absolute minimal implementation focused on reliability
- Action buttons in the UI are display-only and don't perform real actions
- The detection algorithm uses simple keyword matching
- The popup shows only the essential information

This extension serves as a simple starting point that you can build upon once you confirm it's working properly.