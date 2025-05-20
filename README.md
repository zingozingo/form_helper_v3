# Business Registration Assistant

A Chrome extension that detects business registration forms on government websites with a Python backend for form data validation and processing.

## Project Structure

The project is organized into three main directories:

- **docs/** - Documentation and development notes
- **knowledge/** - JSON files containing business entity types and state-specific information
- **extension/** - The core extension files
- **tests/** - Unit tests for the Python components

## Features

- Business registration form detection using URL, content, and form field analysis
- Advanced field classification system that categorizes form fields by purpose
- Field relationship detection to identify related form fields
- Python-based form data validation and processing
- State-specific business entity validation
- Field formatting and normalization
- Smart confidence scoring with adaptive learning
- Visual debugging tools for form field analysis
- Detailed detection information in popup UI

## Extension Structure

- **manifest.json** - Extension configuration (Manifest V3)
- **content.js** - Form detection logic and field analysis
- **modules/** - Modular components for specific functionality
  - **fieldDetector.js** - Field detection and classification system
  - **urlDetector.js** - URL analysis for form type detection
- **background.js** - Service worker for managing detection results
- **popup.html/css/js** - User interface files
- **panel.html/css/js** - Side panel interface for detailed analysis
- **icons/** - Extension icons in various sizes

## Python Components

- **form_helper.py** - Python script for form data validation and processing
- **knowledge/** - JSON data used by both the extension and Python script
  - **entities/entity_types.json** - Business entity definitions and requirements
  - **states/** - State-specific requirements and rules

## Installation

### Chrome Extension

1. In Chrome, go to `chrome://extensions/`
2. Enable "Developer mode" with the toggle in the top-right corner
3. Click "Load unpacked" and select the `extension` directory
4. The extension is now installed and ready to use

### Python Helper

Requirements:
- Python 3.7+

```bash
# Install required dependencies
pip install -r requirements.txt

# Run the Python helper
python form_helper.py --input example_data.json --state CA --output processed_form.json
```

## Python Form Helper Usage

```
python form_helper.py --input <json_file> --state <state_code> --output <output_file> [--format json|csv|txt] [--verbose]
```

Options:
- `--input`: Path to input JSON file with form data
- `--state`: Two-letter state code (e.g., CA, NY, DE)
- `--output`: Path to output file
- `--format`: Output format (default: json)
- `--verbose`: Enable verbose output

## Documentation

For more detailed information, refer to the docs directory:

- [Field Classification System](docs/FIELD_CLASSIFICATION.md) - Details about the field classification system
- [URL Detection](docs/URL_DETECTOR.md) - URL analysis methodology
- [Error Handling](docs/ERROR_HANDLING.md) - Error handling approach
- [Development Guide](docs/development.md) - Development guidelines

## Usage Example

1. Visit a business registration website (government sites work best)
2. The extension detects and analyzes the form
3. Export the form data as JSON
4. Process and validate the data with the Python helper:

```bash
python form_helper.py --input form_data.json --state CA --output validated_form.json
```

## Testing

```bash
# Run Python tests
python -m unittest tests/test_form_helper.py
```

## Current Limitations

- Limited state-specific data for some jurisdictions
- UI doesn't yet display the full field classification results
- No user feedback mechanism for incorrect classifications
- No form submission monitoring or validation