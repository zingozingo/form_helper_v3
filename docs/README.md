# Business Registration Assistant

A Chrome extension that helps entrepreneurs and small business owners complete business registration forms more easily.

## Project Overview

The Business Registration Assistant is an intelligent Chrome extension that detects business registration forms on government websites, analyzes form requirements, and provides context-specific assistance to users. The tool aims to simplify the complex process of registering a business entity.

## Features

- **Intelligent Form Detection**: Automatically detects business registration forms on government websites
- **State-Specific Knowledge**: Provides information about registration requirements for different states
- **Entity Type Guidance**: Offers guidance based on the type of business entity being registered
- **Field Assistance**: Explains what information is required for different form fields
- **Form Context Analysis**: Understands the broader context of the registration process

## Extension Structure

```
extension/
├── background.js        # Service worker for background tasks
├── content.js           # Content script for form detection and interaction
├── manifest.json        # Extension configuration
├── panel.html           # Main extension UI
├── panel.css            # Styles for the extension UI
├── panel.js             # JavaScript for the extension UI
├── data/                # Data files for extension functionality
├── lib/                 # Utility libraries and helper functions
└── ui/                  # Additional UI components
    └── components/      # Reusable UI components

knowledge/
├── entities/            # Knowledge base for different business entity types
└── states/              # State-specific registration requirements
```

## Installation (Developer Mode)

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the `extension` directory from this project
5. The extension icon should appear in your browser toolbar

## Development

### Prerequisites

- Google Chrome browser
- Basic knowledge of JavaScript, HTML, and CSS
- Understanding of Chrome extension architecture

### Local Development

1. Make changes to the extension files as needed
2. To test changes, reload the extension on the `chrome://extensions/` page
3. For content script changes, refresh the webpage where the extension is being tested

### Building for Production

For production distribution, the extension should be packaged as a .zip file and submitted to the Chrome Web Store. A build script will be added in a future update.

## Usage

1. Navigate to a business registration website (state secretary of state, business portal, etc.)
2. The extension will automatically detect if the current page is a business registration form
3. If a form is detected, the extension icon will activate
4. Click the extension icon to open the assistance panel
5. Use the provided tools and information to help complete the registration form

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- State Secretary of State offices for making business registration information available
- Small Business Administration for providing resources on business formation