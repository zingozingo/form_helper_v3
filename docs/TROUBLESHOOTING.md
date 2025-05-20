# Troubleshooting Guide

This document provides guidance for diagnosing and resolving common issues with the Business Registration Assistant extension.

## Diagnostic Tools

The extension includes several built-in diagnostic tools to help identify issues:

### Background Script Diagnostics

To access diagnostic information from the background script:

1. Open Chrome DevTools for the extension's background page:
   - Go to `chrome://extensions`
   - Enable Developer Mode
   - Click "Inspect views: background page" for the Business Registration Assistant

2. In the console, run:
   ```javascript
   // Get diagnostics for the current active tab
   chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
     chrome.runtime.sendMessage({
       action: 'getDiagnostics',
       tabId: tabs[0].id
     }, console.log);
   });
   ```

### Content Script Diagnostics

To enable debug mode and access content script diagnostics directly in a web page:

1. Open Chrome DevTools for the web page
2. In the console, run:
   ```javascript
   // Enable debug mode
   window.BRA_DEBUG = true;
   
   // Get current diagnostics
   window.diagnostics
   ```

3. You can also request diagnostics via a message:
   ```javascript
   chrome.runtime.sendMessage({
     action: 'getDiagnostics'
   }, console.log);
   ```

## Common Issues and Solutions

### 1. Extension Not Detecting Forms

**Symptoms:**
- The extension icon shows no indicator
- No form detection results appear in the popup

**Possible Causes:**
- Content script not running or failing
- Module loading issues
- Connection problems between content and background scripts
- CSP restrictions blocking script execution

**Diagnostic Steps:**

1. Check if content script is loaded:
   ```javascript
   // In page console
   typeof chrome.runtime !== 'undefined'  // Should return 'object'
   ```

2. Check module loading status:
   ```javascript
   // In page console
   window.diagnostics?.moduleLoading
   ```

3. Check detection strategies:
   ```javascript
   // In page console
   window.detectionStrategies
   ```

**Solutions:**

- **Content Script Loading:**
  - Check manifest.json matches patterns
  - Verify there are no CSP issues in console
  - Try refreshing the page

- **Module Loading:**
  - Update web_accessible_resources configuration
  - Verify module paths are correct
  - Try alternative module loading methods

- **Connection Issues:**
  - Restart the browser
  - Reinstall the extension
  - Check for conflicting extensions

### 2. CSP Restrictions Blocking Scripts

**Symptoms:**
- Console errors mentioning CSP violations
- Module loading fails
- Features work on some sites but not others

**Diagnostic Steps:**

1. Check for CSP errors in the web page console
2. Inspect the site's CSP headers:
   ```javascript
   // In page console
   Array.from(document.getElementsByTagName('meta'))
     .filter(m => m.httpEquiv === 'Content-Security-Policy')
     .map(m => m.content)
   ```

**Solutions:**

- Update manifest.json with appropriate CSP directives
- Use the extension's alternative module loading methods
- Implement fallback detection mechanisms
- Modify extension to work with restrictive CSP environments

### 3. Field Classification Issues

**Symptoms:**
- Fields not properly categorized
- Low confidence scores for classifications
- Missing field relationships

**Diagnostic Steps:**

1. Enable debug visualization:
   ```javascript
   // In page console
   const detector = new FieldDetector.default(document.querySelector('form'), { debug: true });
   detector.detectFields();
   detector.classifyFields();
   detector.highlightFields(false, { showLabels: true, showRelationships: true });
   ```

2. Check field detection diagnostics:
   ```javascript
   // In page console
   detector.getClassificationSummary()
   ```

**Solutions:**

- Update field pattern knowledge base
- Enhance field relationship detection algorithms
- Add special handling for unusual form structures
- Implement site-specific adaptations for problematic forms

### 4. Connection Loss Between Scripts

**Symptoms:**
- Inconsistent behavior
- Features stop working after page has been open for a while
- "Fallback" indicators appearing

**Diagnostic Steps:**

1. Check connection status:
   ```javascript
   // In page console
   window.connectionEstablished
   ```

2. Try a manual ping:
   ```javascript
   // In page console
   chrome.runtime.sendMessage({ action: 'ping' }, console.log)
   ```

**Solutions:**

- Implement automatic reconnection mechanism
- Add periodic connection checks
- Increase retry attempts and timeouts
- Update background script to monitor tab connections

### 5. Form Detection Timing Issues

**Symptoms:**
- Forms on dynamic pages not being detected
- Detection works on refresh but not initial load
- Inconsistent detection results

**Diagnostic Steps:**

1. Check document state history:
   ```javascript
   // In page console
   window.diagnostics?.documentStates
   ```

2. Review detection strategy outcomes:
   ```javascript
   // In page console
   window.detectionStrategies
   ```

**Solutions:**

- Adjust detection timing and strategies
- Enhance MutationObserver configuration
- Implement progressive detection with multiple attempts
- Add event listeners for dynamic content changes

## Performance Troubleshooting

If the extension is causing performance issues:

1. Check if unnecessary highlighting is active:
   ```javascript
   // In page console
   document.querySelectorAll('.bra-field-highlight').length
   ```

2. Verify detection attempts are not excessive:
   ```javascript
   // In page console
   window.detectionAttempts
   ```

3. Look for redundant observers:
   ```javascript
   // This requires DevTools performance monitoring
   // Look for excessive "MutationObserver" entries in the performance timeline
   ```

## Submitting Diagnostics

When reporting issues, include the following diagnostic information:

1. Complete diagnostic data:
   ```javascript
   // In page console
   copy(JSON.stringify({
     diagnostics: window.diagnostics,
     strategies: window.detectionStrategies,
     documentState: document.readyState,
     url: window.location.href,
     userAgent: navigator.userAgent
   }, null, 2))
   ```

2. Steps to reproduce the issue
3. Browser and extension version information
4. Screenshots of any visual issues or error messages