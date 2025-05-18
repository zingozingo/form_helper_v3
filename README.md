# Business Registration Assistant

A minimalist Chrome extension that detects business registration forms on websites. This is a simple, working version with only essential functionality.

## Project Structure

The project is organized into three main directories:

- **docs/** - Documentation and development notes
- **knowledge/** - JSON files containing business entity types and state-specific information
- **extension/** - The core extension files

## Features

- Basic form detection using URL, content, and form field analysis
- Simple popup UI showing detection status
- State identification when possible
- Confidence score display

## Extension Structure

- **manifest.json** - Extension configuration (Manifest V3)
- **content.js** - Form detection logic
- **background.js** - Service worker for managing detection results
- **popup.html/css/js** - User interface files
- **icons/** - Extension icons in various sizes

## Installation

1. In Chrome, go to `chrome://extensions/`
2. Enable "Developer mode" with the toggle in the top-right corner
3. Click "Load unpacked" and select the `extension` directory
4. The extension is now installed and ready to use

## Current Limitations

This is a minimal implementation focused on core functionality:

- No advanced form analysis
- No auto-fill capabilities (buttons in UI are placeholders)
- Limited state detection
- Simple confidence scoring algorithm

## Usage

1. Visit a business registration website (government sites work best)
2. The extension icon will show a checkmark if a form is detected
3. Click the extension icon to see detection details
4. Use the "Check Again" button if needed