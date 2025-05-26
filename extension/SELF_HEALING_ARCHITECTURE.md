# Self-Healing Architecture

## Overview

The Business Registration Assistant extension now features a self-healing architecture that automatically recovers from extension context invalidation. This design ensures the extension continues working seamlessly during development, even when the extension is reloaded multiple times.

## Key Components

### 1. Self-Healing Content Script (`content_selfhealing.js`)

The content script operates autonomously and can function without a connection to the background script:

- **Autonomous Field Detection**: Performs field detection using built-in patterns
- **Connection Monitoring**: Checks connection status every 3 seconds
- **Message Queuing**: Queues messages when offline, sends when reconnected
- **Automatic Sync**: Syncs detection state when connection is restored

#### Key Features:
```javascript
// Autonomous operation
const detector = new AutonomousFieldDetector();
const detection = await detector.detect(); // Works offline

// Self-healing messaging
const messenger = new SelfHealingMessenger();
await messenger.send(message); // Queues if offline

// Connection events
messenger.on('reconnected', () => {
  // Automatically sync state
});
```

### 2. Self-Healing Background Script (`background_selfhealing.js`)

The background script maintains detection states and handles reconnections:

- **State Persistence**: Maintains detection states across disconnections
- **Connection Tracking**: Monitors which content scripts are connected
- **Automatic Recovery**: Handles reconnection and state synchronization
- **Health Monitoring**: Periodic checks for content script status

#### Key Features:
- Detection states cached by tab ID
- Automatic badge updates
- Connection status tracking
- Graceful handling of missing content scripts

### 3. Self-Healing Panel (`panel_selfhealing.js`)

The panel UI gracefully handles disconnections:

- **Visual Connection Indicator**: Shows connection status
- **Cached Data Display**: Shows last known detection when offline
- **Automatic Refresh**: Updates when connection restored
- **Status Messages**: Informs user of connection state

#### Visual Indicators:
- Green dot: Connected
- Red pulsing dot: Disconnected
- Status messages for connection events

## How It Works

### Normal Operation Flow

1. Content script initializes and starts monitoring the page
2. Performs autonomous field detection
3. Sends results to background script (if connected)
4. Background script updates badge and notifies panel
5. Panel displays real-time detection results

### Disconnection Recovery Flow

1. Extension context becomes invalid (reload, update, etc.)
2. Content script detects disconnection
3. Switches to offline mode, continues detecting
4. Queues any messages for later delivery
5. When connection restored:
   - Syncs current detection state
   - Processes queued messages
   - Updates UI to show current state

### Key Design Principles

1. **Autonomous Operation**: Each component can work independently
2. **Graceful Degradation**: Features degrade gracefully when offline
3. **Automatic Recovery**: No manual intervention needed
4. **State Persistence**: Detection results cached and synced
5. **Silent Failures**: Context errors handled without console spam

## Development Benefits

1. **Continuous Operation**: Extension keeps working during development
2. **No Manual Refresh**: Automatic recovery when extension reloads
3. **State Preservation**: Detection results persist across reloads
4. **Error Resilience**: Handles all context invalidation scenarios
5. **Visual Feedback**: Clear indicators of connection status

## Implementation Details

### Connection Monitoring
```javascript
// Check every 3 seconds
setInterval(() => {
  this.checkConnection();
}, 3000);

// Quick ping with 1-second timeout
async sendPing() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 1000);
    chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
      clearTimeout(timeout);
      resolve(!!(response && response.alive));
    });
  });
}
```

### Message Queuing
```javascript
// Queue messages when offline
if (!this.isConnected) {
  this.messageQueue.push({ message, options, timestamp });
  return null;
}

// Process queue when reconnected
async processMessageQueue() {
  for (const item of this.messageQueue) {
    await this.send(item.message, item.options);
  }
}
```

### Field Detection Patterns
```javascript
// Built-in patterns for offline operation
this.patterns = {
  business_name: {
    patterns: ['business.*name', 'company.*name'],
    keywords: ['business', 'company', 'llc'],
    priority: 10
  },
  // ... more patterns
};
```

## Testing the Self-Healing Features

1. **Test Disconnection Recovery**:
   - Open extension on a form
   - Reload extension from chrome://extensions
   - Observe automatic recovery

2. **Test Offline Detection**:
   - Disconnect by reloading extension
   - Navigate to new form pages
   - Reconnect and observe sync

3. **Test Message Queuing**:
   - Perform actions while disconnected
   - Observe queued messages sent on reconnection

4. **Test Visual Indicators**:
   - Watch connection indicator change
   - Observe status messages
   - Check cached data display

## Future Enhancements

1. **Local Storage Persistence**: Save detection results to localStorage
2. **Conflict Resolution**: Handle conflicts when online/offline states differ
3. **Batch Sync**: Efficiently sync multiple detections
4. **Performance Metrics**: Track recovery times and success rates
5. **User Preferences**: Allow users to configure sync behavior