# Content Security Policy (CSP) Compliance Guide

## Overview

This guide explains how to make the Business Registration Assistant extension fully CSP-compliant by removing all inline styles and using proper external stylesheets.

## What Changed

### 1. Removed All Inline Styles

**Before (CSP Violation):**
```javascript
// JavaScript
element.style.display = 'none';
element.style.width = '50%';
element.setAttribute('style', 'color: red');

// HTML
<div style="display: none;">Content</div>
```

**After (CSP Compliant):**
```javascript
// JavaScript
element.classList.add('hidden');
element.classList.add('width-50');

// HTML
<div class="hidden">Content</div>
```

### 2. Created CSS Classes for Dynamic Styles

For dynamic values like confidence percentages, we created discrete CSS classes:

```css
/* Confidence width classes */
.confidence-0 { width: 0% !important; }
.confidence-10 { width: 10% !important; }
.confidence-20 { width: 20% !important; }
/* ... up to 100 */
```

### 3. Updated Manifest CSP

The manifest now has a strict CSP that disallows inline styles:

```json
"content_security_policy": {
  "extension_pages": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://*.gov; font-src 'self'"
}
```

## Files Updated

### New CSP-Compliant Files:
- `panel_selfhealing_csp.html` - No inline styles
- `panel_selfhealing_csp.js` - Uses CSS classes instead of style properties
- `panel_selfhealing_csp.css` - Contains all necessary styles
- `manifest_csp.json` - Strict CSP configuration

## Implementation Patterns

### 1. Visibility Toggle

**Old Way:**
```javascript
element.style.display = 'none';
element.style.display = 'block';
```

**New Way:**
```javascript
element.classList.add('hidden');
element.classList.remove('hidden');
```

**CSS:**
```css
.hidden {
  display: none !important;
}
```

### 2. Dynamic Width

**Old Way:**
```javascript
element.style.width = `${percentage}%`;
```

**New Way:**
```javascript
// Round to nearest 10
const rounded = Math.round(percentage / 10) * 10;
element.classList.add(`confidence-${rounded}`);
```

### 3. Status Messages

**Old Way:**
```javascript
statusElement.style.display = 'block';
setTimeout(() => {
  statusElement.style.display = 'none';
}, 5000);
```

**New Way:**
```javascript
statusElement.classList.remove('hidden');
setTimeout(() => {
  statusElement.classList.add('hidden');
}, 5000);
```

## Best Practices

### 1. Use Data Attributes for State

For complex state management, use data attributes:

```javascript
element.setAttribute('data-state', 'active');
element.setAttribute('data-confidence', '80');
```

```css
[data-state="active"] {
  background-color: #4CAF50;
}

[data-confidence="80"] .confidence-bar {
  width: 80%;
}
```

### 2. Predefined Animation Classes

Instead of animating with JavaScript:

```css
.fade-in {
  animation: fadeIn 0.3s ease;
}

.slide-out {
  animation: slideOut 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

### 3. Utility Classes

Create utility classes for common styles:

```css
/* Spacing */
.mt-1 { margin-top: 4px; }
.mt-2 { margin-top: 8px; }
.p-1 { padding: 4px; }
.p-2 { padding: 8px; }

/* Text */
.text-center { text-align: center; }
.text-small { font-size: 12px; }
.text-muted { color: #666; }

/* Layout */
.flex { display: flex; }
.flex-1 { flex: 1; }
.gap-1 { gap: 4px; }
.gap-2 { gap: 8px; }
```

## Testing CSP Compliance

### 1. Check Console for Violations

Open the browser console and look for CSP violation messages:
```
Refused to apply inline style because it violates the following Content Security Policy directive...
```

### 2. Use Chrome DevTools

1. Open DevTools
2. Go to Security tab
3. Check for CSP violations

### 3. Validate Manifest

Ensure your manifest.json has proper CSP:
```json
"content_security_policy": {
  "extension_pages": "default-src 'self'; script-src 'self'; style-src 'self'"
}
```

## Common Issues and Solutions

### Issue 1: Dynamic Styles
**Problem:** Need to set styles based on user input or calculations

**Solution:** Use CSS custom properties (CSS variables):
```javascript
element.style.setProperty('--progress', `${value}%`);
```

```css
.progress-bar {
  width: var(--progress, 0%);
}
```

### Issue 2: Third-Party Libraries
**Problem:** Libraries that inject inline styles

**Solution:** 
1. Use CSP-compliant versions
2. Override with !important in external CSS
3. Fork and modify the library

### Issue 3: Content Scripts
**Problem:** Content scripts injecting styles into web pages

**Solution:** 
1. Use chrome.scripting.insertCSS() API
2. Create a separate CSS file for injected styles
3. Add styles to shadow DOM if isolation needed

## Migration Checklist

- [ ] Remove all `element.style.*` assignments
- [ ] Remove all `style=""` attributes from HTML
- [ ] Create CSS classes for all dynamic styles
- [ ] Update JavaScript to use classList methods
- [ ] Test with strict CSP enabled
- [ ] Check browser console for violations
- [ ] Verify all functionality still works
- [ ] Update documentation

## Benefits of CSP Compliance

1. **Security**: Prevents XSS attacks through style injection
2. **Performance**: External stylesheets can be cached
3. **Maintainability**: Separation of concerns
4. **Compatibility**: Works with strict website CSPs
5. **Future-Proof**: Follows web standards and best practices