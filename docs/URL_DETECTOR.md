# URL Detector Module

## Overview

The URL Detector module is a specialized component designed to analyze URLs and determine if they are likely business registration pages on government sites. It provides high precision URL analysis using pattern matching and scoring algorithms to identify business registration-related URLs.

## Features

- **Government Domain Detection**: Identifies URLs from government domains across multiple countries (US, CA, UK, AU, NZ)
- **Business Term Analysis**: Searches for business registration-related terms in URLs
- **Path Pattern Analysis**: Identifies common path patterns used in business registration sites
- **Known Site Matching**: Compares against a database of known business registration sites
- **Query Parameter Analysis**: Examines URL query parameters for registration indicators
- **State Identification**: Attempts to determine the U.S. state from the URL

## Usage

The module provides two main methods:

### 1. `analyzeUrl(url)`

Analyzes a URL to determine if it's likely a business registration page.

```javascript
import URLDetector from './modules/urlDetector.js';

const url = 'https://sos.ca.gov/business-programs/business-entities/';
const analysis = URLDetector.analyzeUrl(url);

console.log(analysis.score); // Confidence score (0-100)
console.log(analysis.isLikelyRegistrationSite); // Boolean
console.log(analysis.reasons); // Array of reasons for the score
```

#### Return Value

The `analyzeUrl` method returns an object with the following properties:

- `score` (number): Confidence score from 0 to 100
- `isLikelyRegistrationSite` (boolean): True if score >= 60
- `reasons` (array): List of reasons that contributed to the score
- `domain` (string): Extracted domain from the URL
- `pathAnalysis` (object): Analysis of the URL path

### 2. `identifyStateFromUrl(url)`

Attempts to identify the U.S. state associated with the URL.

```javascript
import URLDetector from './modules/urlDetector.js';

const url = 'https://sos.ca.gov/business-programs/business-entities/';
const stateCode = URLDetector.identifyStateFromUrl(url);

console.log(stateCode); // "CA"
```

#### Return Value

The `identifyStateFromUrl` method returns:

- Two-letter state code (string) if a state is identified
- `null` if no state could be determined

## Scoring System

The URL analysis generates a confidence score from 0 to 100 based on multiple factors:

| Factor | Max Score | Description |
|--------|-----------|-------------|
| Government Domain | 30 | .gov, .state., etc. domains |
| Business Terms in Domain | 25 | "business", "register", etc. in domain |
| Business Terms in Path | 25 | "business", "register", etc. in path |
| Registration Path Patterns | 25 | "/business", "/register", etc. in path |
| Known Registration Site | 40 | Matches known business registration sites |
| Query Parameters | 20 | Business-related query parameters |

The final score is normalized to a maximum of 100.

## Confidence Levels

- **High Confidence (80-100)**: Very likely a business registration page
- **Medium Confidence (60-79)**: Likely a business registration page
- **Low Confidence (30-59)**: Possibly related to business registration
- **Very Low Confidence (0-29)**: Unlikely to be a business registration page

## Module Structure

The module consists of:

- Constants for government domains
- Constants for business URL terms
- Constants for known registration sites
- Helper methods for pattern matching
- Main analysis functions

## Examples

### High Confidence URLs

- `https://sos.ca.gov/business-programs/business-entities/`
- `https://www.dos.ny.gov/corporations/busforms.html`
- `https://bizfileonline.sos.ca.gov/registration`

### Medium Confidence URLs

- `https://tax.ny.gov/bus/startup/`
- `https://countyofriverside.us/business/forms/fictitious_business_name.html`

### Low Confidence URLs

- `https://dmv.ca.gov/business-partners`
- `https://www.taxpayer.ny.gov/online`

## Testing

The module includes a test utility (`urlDetector.test.js`) that can be used to test the detection capabilities against a set of sample URLs. Run this in a browser environment to see the results.

## Integration

The URL Detector is integrated with the content script to enhance form detection. The content script uses the URL analysis as one component of its overall detection system, alongside content analysis and form element analysis.