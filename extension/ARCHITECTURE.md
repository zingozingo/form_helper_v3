# ARCHITECTURE.md

⚠️ **WARNING: DO NOT DELETE FILES - Complex interdependencies exist that aren't obvious from filenames** ⚠️

This document outlines the key dependencies and architecture of the Business Registration Assistant Chrome Extension. The extension uses a standalone architecture that eliminates extension context invalidation errors (BRA errors) by embedding all dependencies directly into the content script.

## 1) Field Detection System

The field detection system is self-contained within the content script to prevent dependency failures:

```
content_standalone.js
├── StandaloneFieldDetector (embedded class)
│   ├── KNOWLEDGE_BASE (embedded data)
│   │   ├── fieldPatterns
│   │   ├── stateOverrides
│   │   ├── entityTypes
│   │   └── formTypes
│   └── Field analysis methods
│       ├── detectFields()
│       ├── _analyzeField()
│       ├── _classifyField()
│       └── _findLabel()
└── StandaloneURLAnalyzer (embedded class)
    ├── urlPatterns (embedded)
    └── State identification logic
```

**Key Points:**
- All field detection logic is embedded directly in content_standalone.js
- No external module dependencies (fieldDetectorStatic.js and staticKnowledge.js are backups)
- Knowledge base is hardcoded to prevent file loading failures

## 2) UI Components

The UI system uses an iframe-based architecture for complete style isolation:

```
content_standalone.js
├── StandaloneSidebarPanelUI (main UI class)
│   ├── Creates iframe container
│   ├── Injects panel HTML/CSS/JS as strings
│   └── Message handling via postMessage
└── Panel Content (generated inline)
    ├── panel_standalone.html (reference only - content embedded)
    ├── panel_standalone.css (reference only - styles embedded)
    └── panel_standalone.js (reference only - script embedded)

popup_minimal.html
└── Minimal popup (no JS dependencies)

background_minimal.js
└── Minimal service worker (handles side panel API only)
```

**Key Points:**
- Panel HTML/CSS/JS are embedded as strings in content_standalone.js
- The panel_standalone.* files exist for reference but aren't loaded at runtime
- iframe provides complete style isolation
- Communication via postMessage, not chrome.runtime

## 3) Storage System

The extension uses a standalone approach with no persistent storage dependencies:

```
content_standalone.js
├── Detection results stored in memory only
├── No chrome.storage.* usage
└── State managed within class instances
    ├── StandaloneBusinessFormDetector.detectionResult
    └── StandaloneSidebarPanelUI.detectionResult
```

**Key Points:**
- No chrome.storage API usage (prevents permission errors)
- All state is ephemeral and page-specific
- Detection runs fresh on each page load

## 4) Knowledge Base

The knowledge base is fully embedded to ensure availability:

```
content_standalone.js
└── KNOWLEDGE_BASE (hardcoded object)
    ├── fieldPatterns
    │   ├── business_name patterns
    │   ├── contact field patterns
    │   ├── address field patterns
    │   └── tax/ID field patterns
    ├── stateOverrides
    │   ├── CA specific patterns
    │   ├── DC specific patterns
    │   ├── DE specific patterns
    │   └── Other state overrides
    ├── entityTypes
    │   └── LLC, Corporation, etc.
    └── urlPatterns
        ├── Government domain patterns
        └── State-specific URL patterns

knowledge/ (reference files - not loaded at runtime)
├── common/
│   ├── common-patterns.json
│   ├── field-definitions.json
│   ├── patterns.json
│   └── validation-rules.json
├── entities/
│   └── entity_types.json
└── states/
    ├── california.json
    ├── delaware.json
    └── dc/
        ├── agencies.json
        ├── forms.json
        └── overrides.json
```

**Key Points:**
- All knowledge is embedded in content_standalone.js
- JSON files exist for reference/development but aren't loaded
- No file fetching = no loading failures

## Architecture Benefits

1. **No BRA Errors**: Extension context can't be invalidated because there are no runtime dependencies
2. **No Message Passing Failures**: UI communication uses postMessage, not chrome.runtime
3. **Complete Isolation**: iframe prevents style conflicts
4. **Self-Healing**: Each page load gets fresh detection with no stale state

## Critical Files - DO NOT DELETE

1. **content_standalone.js** - Contains entire application logic
2. **background_minimal.js** - Required for manifest, handles side panel
3. **manifest.json** - Extension configuration
4. **popup_minimal.html** - User-facing popup
5. **panel_standalone.* files** - Reference implementations (embedded at runtime)

## Message Flow

```
Page Load
    ↓
content_standalone.js initializes
    ↓
Detects business forms (no external calls)
    ↓
Creates sidebar panel with iframe
    ↓
Injects panel UI (HTML/CSS/JS as strings)
    ↓
Panel ←→ Content Script (postMessage only)
```

This architecture ensures the extension continues working even if:
- Chrome invalidates the extension context
- Background script stops responding  
- User navigates quickly between pages
- Page has conflicting styles or scripts