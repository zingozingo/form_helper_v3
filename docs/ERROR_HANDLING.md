# Error Handling Architecture

This document describes the error handling architecture in the Business Registration Assistant extension, which provides robust error detection, reporting, and recovery for a better user experience on complex government websites.

## Overview

The extension implements a multi-layered error handling system that:

1. Detects errors across all components (content script, background, panel)
2. Reports errors to a central collection system in the background script
3. Records context and severity information with each error
4. Displays user-friendly error messages with troubleshooting steps
5. Provides visual indicators for different error states
6. Implements retry mechanisms and recovery strategies

## Error Collection & Distribution

### Content Script (content.js)

The content script is the most error-prone component since it interacts with potentially complex or restricted web pages. Key error handling features:

- `reportError(error, context, isFatal)` function to standardize error reporting
- Try/catch blocks around all DOM operations and messaging
- Context information captured with each error (function name, operation type)
- Severity flags to distinguish between recoverable and fatal errors
- Retry mechanism with configurable attempts for detection operations
- Multiple loading strategies to handle various page structures
- Defensive coding with checks for document.body existence

### Background Script (background.js)

The background script serves as the central error collector and distributor:

- `detectionErrors` object stores errors by tab ID
- `errorCounts` tracks error frequency to prevent overwhelming the user
- Visual badge indicators (red "!" for errors)
- Chrome notifications for critical errors
- Error throttling to limit notifications to MAX_ERROR_NOTIFICATIONS (3)
- Context-based error filtering and prioritization
- Error cleanup on tab close or URL change

### Panel UI (panel.js)

The panel provides user-facing error information:

- Formatted error display with context-specific troubleshooting tips
- Error styling with color coding and visual hierarchy
- Error count display for multiple issues
- Retrieves errors from both background script and direct content script communication
- Real-time status updates during detection attempts
- "Check Again" functionality for retry attempts

## Error Types and Categories

The system categorizes errors into several types:

1. **Connection Errors**: Unable to connect to content script
   - Causes: CSP restrictions, script not loaded, timing issues
   - Recovery: Refresh page, check extension permissions

2. **Detection Errors**: Business form detection fails
   - Causes: Complex DOM, dynamic content, missing elements
   - Recovery: Multiple detection strategies, MutationObserver, retry

3. **Permission Errors**: Extension lacks required permissions
   - Causes: Missing host permissions, restricted site
   - Recovery: Prompt for permissions, provide alternative workflows

4. **Content Script Errors**: Exceptions in content script execution
   - Causes: DOM manipulation errors, timing issues
   - Recovery: Try/catch with fallback behaviors, defensive coding

5. **Communication Errors**: Message passing failures
   - Causes: Disconnected ports, context invalidation
   - Recovery: Error checking in callbacks, alternative communication channels

## Error Reporting Flow

1. Error occurs in component (e.g., content script)
2. Local error handler captures error with context
3. Error reported to background script via messaging
4. Background script stores error with tab association
5. Background script updates badge and shows notification if needed
6. Panel UI requests errors when opened
7. Panel UI formats and displays error with troubleshooting steps

## User Experience Considerations

- **Progressive disclosure**: Only show detailed errors when appropriate
- **Contextual help**: Provide specific troubleshooting steps based on error type
- **Visual indicators**: Badge colors and icons indicate different states
- **Self-healing**: Automatic retry mechanisms for transient errors
- **Transparency**: Clear communication about what went wrong
- **Action-oriented**: Always provide next steps or possible solutions

## Implementation Details

### Error Object Structure

```javascript
{
  message: "Error message text",
  stack: "Error stack trace if available",
  context: "Function or operation where error occurred",
  isFatal: true/false, // Whether error prevents core functionality
  timestamp: "ISO timestamp",
  url: "Page URL where error occurred"
}
```

### Error Display Styling

The panel UI uses color-coded error displays:
- Red background for critical errors
- Yellow/amber for warnings
- Tip sections with lighter backgrounds
- Context-specific troubleshooting in bulleted lists

### Notification Throttling

```javascript
// Track error counts to prevent overwhelming the user
const errorCounts = {};
const MAX_ERROR_NOTIFICATIONS = 3;

// Helper to determine if we should show a notification for this error
function shouldNotifyError(tabId, context) {
  if (!errorCounts[tabId]) {
    errorCounts[tabId] = { total: 0, contexts: {} };
  }
  
  // Increment counters
  errorCounts[tabId].total++;
  errorCounts[tabId].contexts[context] = (errorCounts[tabId].contexts[context] || 0) + 1;
  
  // Only notify about the first few errors
  return errorCounts[tabId].total <= MAX_ERROR_NOTIFICATIONS;
}
```

## Testing Approach

The error handling system has been tested with:

1. **Intentional failures**: Injecting errors to test reporting
2. **Edge cases**: Testing with unusual page structures
3. **Recovery scenarios**: Verifying retry mechanisms work
4. **User feedback**: Testing clarity of error messages
5. **Extreme conditions**: Testing with restricted CSP sites
6. **Performance impact**: Ensuring error handling doesn't degrade performance

## Future Improvements

Potential enhancements to the error handling system:

1. Remote error logging for aggregate analysis
2. More sophisticated retry strategies with exponential backoff
3. Enhanced error categorization and pattern detection
4. Predictive error prevention based on page characteristics
5. User-configurable error reporting preferences