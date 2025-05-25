# Debug Detection Flow

## How to Debug Detection Issues

### 1. Check Content Script Detection

Open the page console (F12) on the DC business registration page:

```javascript
// Check if detection has run
window.BRA_DEBUG.getDetectionResult()

// Check current state
window.BRA_DEBUG.getState()

// Manually trigger detection
window.BRA_DEBUG.triggerDetection()

// Check health
window.BRA_DEBUG.getHealth()
```

### 2. Check Background Script

In the extension background page console:

1. Go to chrome://extensions
2. Find the extension and click "background page"
3. Check console for logs starting with `[BRA Background]`

### 3. Check Panel Communication

With the panel open, check the panel console:

1. Right-click on the panel
2. Inspect element
3. Check console for logs starting with `[BRA Panel]`

## Expected Log Flow

1. **Content Script Initialization**
   - `[BRA Content] ========== INITIALIZING DETECTION ==========`
   - `[BRA Content] Starting initial detection attempt`

2. **Detection Process**
   - `[BRA Content] Storing detection result globally`
   - `[BRA Content] Sending detection result to background:`
   - Should show confidence, state, and isBusinessForm

3. **Background Storage**
   - `[BRA Background] Received formDetected from tab:`
   - `[BRA Background] Stored detection for tab`

4. **Panel Request**
   - `[BRA Panel] ============ PANEL OPENED ============`
   - `[BRA Panel] Getting detection result for tab:`
   - `[BRA Background] getDetectionResult request for tab:`

5. **UI Update**
   - `[BRA Panel] Got response:`
   - `[BRA Panel] updateUI called with:`
   - `[BRA Panel] updateConfidenceMeter called with:`
   - `[BRA Panel] Set confidence text to: DC - 79%`

## Common Issues

### Issue: "No form detected" in panel

1. **Content script not loaded**
   - Check: `window.BRA_DEBUG` exists in page console
   - Fix: Reload the page

2. **Detection not run**
   - Check: `window.BRA_DEBUG.getDetectionResult()` returns null
   - Fix: `window.BRA_DEBUG.triggerDetection()`

3. **Background script lost result**
   - Check: Background console for stored results
   - Fix: Trigger fresh detection

4. **Panel communication issue**
   - Check: Panel console for errors
   - Fix: Close and reopen panel

### Issue: Detection runs but panel doesn't update

1. **Message passing failure**
   - Check: Chrome runtime errors in all consoles
   - Fix: Reload extension

2. **Tab ID mismatch**
   - Check: Tab IDs in logs match
   - Fix: Ensure correct tab is active

3. **Timing issue**
   - Check: Panel opens before detection completes
   - Fix: Wait for detection or trigger manually

## Manual Testing

1. Open DC business registration page
2. Open page console (F12)
3. Run: `window.BRA_DEBUG.getDetectionResult()`
4. Should see object with `confidenceScore: 79` and `state: "DC"`
5. Open extension panel
6. Should see "DC - 79%" in confidence meter

## Key Log Messages to Look For

- Content: "Sending detection result to background"
- Background: "Stored detection for tab"
- Panel: "Got response" with result object
- Panel: "Set confidence text to: DC - 79%"