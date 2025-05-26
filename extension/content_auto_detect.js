/**
 * Business Registration Assistant - Auto-Detection Content Script
 * Automatic page change detection and field re-scanning
 */

(function() {
  'use strict';
  
  // Skip if already initialized
  if (window.__braContentScriptAutoDetect) {
    return;
  }
  window.__braContentScriptAutoDetect = true;
  
  console.log('[BRA] Initializing auto-detection content script');
  
  // ============= CHANGE DETECTION SYSTEM =============
  class ChangeDetector {
    constructor(onChangeCallback) {
      this.onChangeCallback = onChangeCallback;
      this.debounceTimer = null;
      this.debounceDelay = 500; // 500ms debounce
      this.lastUrl = window.location.href;
      this.lastDetectionTime = 0;
      this.minTimeBetweenDetections = 1000; // Minimum 1s between detections
      this.observerConfig = {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'disabled'],
        characterData: false
      };
      this.mutationObserver = null;
      this.significantChangeThreshold = 10; // Number of mutations to trigger re-scan
      this.mutationCount = 0;
      this.lastMutationReset = Date.now();
      
      // Start monitoring
      this.setupUrlMonitoring();
      this.setupMutationObserver();
      this.setupFormMonitoring();
    }
    
    // Trigger change with debouncing
    triggerChange(reason) {
      console.log(`[BRA ChangeDetector] Change detected: ${reason}`);
      
      // Clear any pending debounce
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      
      // Check minimum time between detections
      const now = Date.now();
      const timeSinceLastDetection = now - this.lastDetectionTime;
      
      if (timeSinceLastDetection < this.minTimeBetweenDetections) {
        // Too soon, schedule for later
        const delay = this.minTimeBetweenDetections - timeSinceLastDetection;
        this.debounceTimer = setTimeout(() => {
          this.executeChange(reason);
        }, delay);
      } else {
        // Debounce normally
        this.debounceTimer = setTimeout(() => {
          this.executeChange(reason);
        }, this.debounceDelay);
      }
    }
    
    // Execute the change callback
    executeChange(reason) {
      console.log(`[BRA ChangeDetector] Executing change callback for: ${reason}`);
      this.lastDetectionTime = Date.now();
      this.mutationCount = 0; // Reset mutation count
      this.lastMutationReset = Date.now();
      
      if (this.onChangeCallback) {
        this.onChangeCallback(reason);
      }
    }
    
    // Monitor URL changes
    setupUrlMonitoring() {
      // Store original pushState and replaceState
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      // Override pushState
      history.pushState = (...args) => {
        originalPushState.apply(history, args);
        this.checkUrlChange('pushState');
      };
      
      // Override replaceState
      history.replaceState = (...args) => {
        originalReplaceState.apply(history, args);
        this.checkUrlChange('replaceState');
      };
      
      // Listen for popstate (back/forward navigation)
      window.addEventListener('popstate', () => {
        this.checkUrlChange('popstate');
      });
      
      // Listen for hashchange
      window.addEventListener('hashchange', () => {
        this.checkUrlChange('hashchange');
      });
      
      // Check URL periodically for changes we might have missed
      setInterval(() => {
        this.checkUrlChange('interval');
      }, 2000);
    }
    
    // Check if URL has changed
    checkUrlChange(source) {
      const currentUrl = window.location.href;
      
      if (currentUrl !== this.lastUrl) {
        console.log(`[BRA ChangeDetector] URL changed via ${source}: ${this.lastUrl} → ${currentUrl}`);
        this.lastUrl = currentUrl;
        this.triggerChange(`URL change (${source})`);
      }
    }
    
    // Monitor DOM mutations
    setupMutationObserver() {
      this.mutationObserver = new MutationObserver((mutations) => {
        // Filter out insignificant mutations
        const significantMutations = mutations.filter(mutation => {
          // Ignore our own modifications
          if (mutation.target.dataset && mutation.target.dataset.braProcessed) {
            return false;
          }
          
          // Ignore style-only changes
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            return false;
          }
          
          // Check if mutation affects form elements
          if (mutation.type === 'childList') {
            const hasFormElements = 
              Array.from(mutation.addedNodes).some(node => 
                node.nodeType === Node.ELEMENT_NODE && 
                (node.matches && node.matches('form, input, select, textarea, fieldset, label'))
              ) ||
              Array.from(mutation.removedNodes).some(node => 
                node.nodeType === Node.ELEMENT_NODE && 
                (node.matches && node.matches('form, input, select, textarea, fieldset, label'))
              );
            
            return hasFormElements;
          }
          
          // Attribute changes on form elements
          if (mutation.type === 'attributes' && mutation.target.matches) {
            return mutation.target.matches('input, select, textarea, form');
          }
          
          return true;
        });
        
        if (significantMutations.length > 0) {
          this.mutationCount += significantMutations.length;
          
          // Reset count if too much time has passed
          if (Date.now() - this.lastMutationReset > 5000) {
            this.mutationCount = significantMutations.length;
            this.lastMutationReset = Date.now();
          }
          
          // Trigger if we've seen enough mutations
          if (this.mutationCount >= this.significantChangeThreshold) {
            console.log(`[BRA ChangeDetector] Significant DOM changes detected (${this.mutationCount} mutations)`);
            this.triggerChange('DOM mutations');
          }
        }
      });
      
      // Start observing
      if (document.body) {
        this.mutationObserver.observe(document.body, this.observerConfig);
        console.log('[BRA ChangeDetector] Mutation observer started');
      } else {
        // Wait for body to be available
        const bodyWatcher = setInterval(() => {
          if (document.body) {
            clearInterval(bodyWatcher);
            this.mutationObserver.observe(document.body, this.observerConfig);
            console.log('[BRA ChangeDetector] Mutation observer started (delayed)');
          }
        }, 100);
      }
    }
    
    // Monitor form-specific changes
    setupFormMonitoring() {
      // Delegate events to catch dynamically added forms
      document.addEventListener('submit', (e) => {
        if (e.target.matches('form')) {
          // Form submitted, might redirect or update page
          setTimeout(() => {
            this.checkUrlChange('form-submit');
          }, 100);
        }
      }, true);
      
      // Monitor AJAX requests that might load new forms
      this.interceptAjax();
      
      // Monitor fetch requests
      this.interceptFetch();
    }
    
    // Intercept XMLHttpRequest
    interceptAjax() {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      const self = this;
      
      XMLHttpRequest.prototype.open = function(...args) {
        this._url = args[1];
        return originalOpen.apply(this, args);
      };
      
      XMLHttpRequest.prototype.send = function(...args) {
        this.addEventListener('load', function() {
          // Check if response might contain form data
          if (this.responseType === '' || this.responseType === 'text' || this.responseType === 'document') {
            const contentType = this.getResponseHeader('content-type') || '';
            if (contentType.includes('html') || this.responseText?.includes('<form')) {
              console.log('[BRA ChangeDetector] AJAX response might contain forms');
              self.triggerChange('AJAX response');
            }
          }
        });
        
        return originalSend.apply(this, args);
      };
    }
    
    // Intercept fetch
    interceptFetch() {
      const originalFetch = window.fetch;
      const self = this;
      
      window.fetch = function(...args) {
        return originalFetch.apply(this, args).then(response => {
          // Clone response to read it
          const clone = response.clone();
          
          // Check content type
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('html')) {
            clone.text().then(text => {
              if (text.includes('<form') || text.includes('<input')) {
                console.log('[BRA ChangeDetector] Fetch response might contain forms');
                self.triggerChange('Fetch response');
              }
            }).catch(() => {});
          }
          
          return response;
        });
      };
    }
    
    // Clean up
    destroy() {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      
      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
      }
    }
  }
  
  // ============= DETECTION STATE MANAGER =============
  class DetectionStateManager {
    constructor() {
      this.currentDetection = null;
      this.isDetecting = false;
      this.detectionHistory = [];
      this.maxHistorySize = 5;
    }
    
    // Clear current detection
    clearDetection() {
      console.log('[BRA DetectionState] Clearing current detection');
      
      // Save to history if exists
      if (this.currentDetection) {
        this.detectionHistory.unshift({
          ...this.currentDetection,
          clearedAt: Date.now()
        });
        
        // Limit history size
        if (this.detectionHistory.length > this.maxHistorySize) {
          this.detectionHistory.pop();
        }
      }
      
      // Clear current
      this.currentDetection = null;
      
      // Clean up any field markers in DOM
      this.cleanupDomMarkers();
    }
    
    // Clean up DOM markers
    cleanupDomMarkers() {
      const markedElements = document.querySelectorAll('[data-bra-processed]');
      markedElements.forEach(el => {
        delete el.dataset.braProcessed;
      });
      
      // Remove any injected styles or elements
      const braElements = document.querySelectorAll('[data-bra-injected]');
      braElements.forEach(el => el.remove());
    }
    
    // Save new detection
    saveDetection(detection) {
      this.currentDetection = {
        ...detection,
        detectedAt: Date.now()
      };
      
      console.log('[BRA DetectionState] Saved new detection with', 
        detection.fields?.length || 0, 'fields');
    }
    
    // Get current detection
    getDetection() {
      return this.currentDetection;
    }
    
    // Check if we should run detection
    shouldRunDetection() {
      if (this.isDetecting) {
        console.log('[BRA DetectionState] Detection already in progress');
        return false;
      }
      
      return true;
    }
    
    // Mark detection as running
    startDetection() {
      this.isDetecting = true;
    }
    
    // Mark detection as complete
    endDetection() {
      this.isDetecting = false;
    }
  }
  
  // ============= MAIN AUTO-DETECTION LOGIC =============
  
  // Import existing detection logic (simplified)
  class FieldDetector {
    constructor() {
      this.fields = [];
      this.sections = [];
    }
    
    async detectFields() {
      console.log('[BRA FieldDetector] Running detection');
      this.fields = [];
      this.sections = [];
      
      try {
        // Find all forms
        const forms = document.querySelectorAll('form');
        const containers = forms.length > 0 ? Array.from(forms) : [document.body];
        
        for (const container of containers) {
          await this.scanContainer(container);
        }
        
        console.log(`[BRA FieldDetector] Found ${this.fields.length} fields`);
        return this.fields;
        
      } catch (error) {
        console.error('[BRA FieldDetector] Error:', error);
        return [];
      }
    }
    
    async scanContainer(container) {
      const inputs = container.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
      const selects = container.querySelectorAll('select');
      const textareas = container.querySelectorAll('textarea');
      
      [...inputs, ...selects, ...textareas].forEach(field => {
        if (this.isVisible(field) && !field.dataset.braProcessed) {
          field.dataset.braProcessed = 'true';
          
          const label = this.findLabel(field);
          const fieldInfo = {
            element: field,
            type: field.type || field.tagName.toLowerCase(),
            name: field.name,
            id: field.id,
            label: label,
            displayName: label, // Use label as the primary display name
            value: field.value || '',
            required: field.hasAttribute('required') || field.getAttribute('aria-required') === 'true',
            options: this.getFieldOptions(field)
          };
          
          // Add debug info about label source
          if (field.id && document.querySelector(`label[for="${field.id}"]`)) {
            fieldInfo.labelSource = 'for/id';
          } else if (field.closest('label')) {
            fieldInfo.labelSource = 'parent-label';
          } else if (field.getAttribute('aria-label')) {
            fieldInfo.labelSource = 'aria-label';
          } else if (field.placeholder) {
            fieldInfo.labelSource = 'placeholder';
          } else if (field.title) {
            fieldInfo.labelSource = 'title';
          } else if (label !== this.humanizeName(field.name) && field.name) {
            fieldInfo.labelSource = 'nearby-text';
          } else {
            fieldInfo.labelSource = 'fallback';
          }
          
          this.fields.push(fieldInfo);
        }
      });
    }
    
    isVisible(element) {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }
    
    getFieldOptions(field) {
      if (field.tagName.toLowerCase() === 'select') {
        return Array.from(field.options).map(opt => ({
          value: opt.value,
          text: opt.textContent.trim(),
          selected: opt.selected
        }));
      }
      return null;
    }
    
    findLabel(field) {
      // Track all potential labels with their sources and scores
      const candidates = [];
      
      // Priority 1: Explicit label associations (highest priority)
      if (field.id) {
        // Check for label[for] attribute
        const explicitLabel = document.querySelector(`label[for="${field.id}"]`);
        if (explicitLabel) {
          const text = this.extractTextContent(explicitLabel, field);
          if (this.isValidLabelText(text)) {
            candidates.push({ text, source: 'label-for', score: 100 });
          }
        }
        
        // Check multiple labels pointing to same field
        const allLabels = document.querySelectorAll(`label[for="${field.id}"]`);
        if (allLabels.length > 1) {
          allLabels.forEach(label => {
            const text = this.extractTextContent(label, field);
            if (this.isValidLabelText(text) && !candidates.some(c => c.text === text)) {
              candidates.push({ text, source: 'label-for-multiple', score: 95 });
            }
          });
        }
      }
      
      // Priority 2: Parent label wrapping
      const parentLabel = field.closest('label');
      if (parentLabel) {
        const text = this.extractTextContent(parentLabel, field);
        if (this.isValidLabelText(text)) {
          candidates.push({ text, source: 'parent-label', score: 90 });
        }
      }
      
      // Priority 3: ARIA attributes
      const ariaLabel = field.getAttribute('aria-label');
      if (ariaLabel && this.isValidLabelText(ariaLabel)) {
        candidates.push({ text: ariaLabel.trim(), source: 'aria-label', score: 85 });
      }
      
      const ariaLabelledBy = field.getAttribute('aria-labelledby');
      if (ariaLabelledBy) {
        const ids = ariaLabelledBy.split(' ').filter(id => id);
        ids.forEach(id => {
          const element = document.getElementById(id);
          if (element) {
            const text = this.extractTextContent(element);
            if (this.isValidLabelText(text)) {
              candidates.push({ text, source: 'aria-labelledby', score: 85 });
            }
          }
        });
      }
      
      // Priority 4: Search parent and sibling elements (2-3 levels)
      const nearbyLabels = this.searchNearbyElements(field, 3);
      nearbyLabels.forEach(({ text, distance, source }) => {
        if (this.isValidLabelText(text)) {
          // Score decreases with distance
          const score = 80 - (distance * 10);
          candidates.push({ text, source, score });
        }
      });
      
      // Priority 5: Placeholder text
      if (field.placeholder && this.isValidLabelText(field.placeholder)) {
        candidates.push({ text: field.placeholder.trim(), source: 'placeholder', score: 60 });
      }
      
      // Priority 6: Title attribute
      if (field.title && this.isValidLabelText(field.title)) {
        candidates.push({ text: field.title.trim(), source: 'title', score: 55 });
      }
      
      // Priority 7: Search nearby text nodes
      const nearbyTextNodes = this.searchNearbyTextNodes(field, 50); // within 50 pixels
      nearbyTextNodes.forEach(({ text, distance }) => {
        if (this.isValidLabelText(text)) {
          const score = 50 - Math.min(distance / 10, 20);
          candidates.push({ text, source: 'nearby-text', score });
        }
      });
      
      // Priority 8: Data attributes
      const dataAttrs = ['data-label', 'data-field-label', 'data-name', 'data-field', 'data-input-label'];
      dataAttrs.forEach(attr => {
        const value = field.getAttribute(attr);
        if (value && this.isValidLabelText(value)) {
          candidates.push({ text: value.trim(), source: attr, score: 40 });
        }
      });
      
      // Priority 9: Table headers (if in table)
      const tableLabel = this.findTableHeaderLabel(field);
      if (tableLabel && this.isValidLabelText(tableLabel)) {
        candidates.push({ text: tableLabel, source: 'table-header', score: 70 });
      }
      
      // Priority 10: Fieldset legend
      const fieldset = field.closest('fieldset');
      if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend) {
          const text = this.extractTextContent(legend);
          if (this.isValidLabelText(text)) {
            candidates.push({ text, source: 'fieldset-legend', score: 65 });
          }
        }
      }
      
      // Sort by score and get the best candidate
      candidates.sort((a, b) => b.score - a.score);
      
      if (candidates.length > 0) {
        const best = candidates[0];
        const cleaned = this.cleanLabelText(best.text);
        
        // Store debug info
        field.dataset.braLabelSource = best.source;
        field.dataset.braLabelScore = best.score;
        
        return cleaned;
      }
      
      // Last resort: Use name or id attribute
      if (field.name && field.name !== 'submit' && field.name !== 'button') {
        return this.humanizeName(field.name);
      }
      
      if (field.id && field.id !== 'submit' && field.id !== 'button') {
        return this.humanizeName(field.id);
      }
      
      return 'Unknown Field';
    }
    
    // Extract text content from an element, optionally excluding a child element
    extractTextContent(element, excludeElement = null) {
      if (!element) return '';
      
      const clone = element.cloneNode(true);
      
      // Remove excluded element if specified
      if (excludeElement) {
        // Try multiple selectors to find and remove the input
        const selectors = [];
        if (excludeElement.id) selectors.push(`#${CSS.escape(excludeElement.id)}`);
        if (excludeElement.name) selectors.push(`[name="${CSS.escape(excludeElement.name)}"]`);
        if (excludeElement.type) selectors.push(`input[type="${excludeElement.type}"]`);
        
        selectors.forEach(selector => {
          try {
            const toRemove = clone.querySelector(selector);
            if (toRemove) toRemove.remove();
          } catch (e) {}
        });
      }
      
      // Remove script and style elements
      clone.querySelectorAll('script, style').forEach(el => el.remove());
      
      // Get text and clean it
      return clone.textContent.trim();
    }
    
    // Check if text is valid as a label
    isValidLabelText(text) {
      if (!text || typeof text !== 'string') return false;
      
      const cleaned = text.trim();
      
      // Must have at least 2 characters
      if (cleaned.length < 2) return false;
      
      // Must not be too long (likely not a label)
      if (cleaned.length > 100) return false;
      
      // Must not be just whitespace or special characters
      if (!/[a-zA-Z0-9]/.test(cleaned)) return false;
      
      // Must not be common button text
      const buttonText = ['submit', 'cancel', 'close', 'ok', 'yes', 'no', 'save', 'delete'];
      if (buttonText.includes(cleaned.toLowerCase())) return false;
      
      // Must not be just numbers
      if (/^\d+$/.test(cleaned)) return false;
      
      // Must not be just IDs or technical strings
      if (/^[a-z]+[-_][a-z]+[-_][a-z]+$/i.test(cleaned)) return false;
      
      return true;
    }
    
    // Search nearby elements within specified levels
    searchNearbyElements(field, maxLevels) {
      const results = [];
      let currentElement = field;
      let level = 0;
      
      // Search up the DOM tree
      while (currentElement && level < maxLevels) {
        // Check previous siblings at current level
        let sibling = currentElement.previousElementSibling;
        let siblingDistance = 0;
        
        while (sibling && siblingDistance < 3) {
          const labelTags = ['label', 'span', 'div', 'p', 'td', 'th', 'dt', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
          
          if (labelTags.some(tag => sibling.tagName.toLowerCase() === tag)) {
            const text = this.extractTextContent(sibling);
            if (text) {
              results.push({
                text,
                distance: level + siblingDistance,
                source: `${sibling.tagName.toLowerCase()}-sibling-L${level}`
              });
            }
          }
          
          sibling = sibling.previousElementSibling;
          siblingDistance++;
        }
        
        // Check parent's previous sibling (common pattern in forms)
        if (currentElement.parentElement) {
          const parentPrev = currentElement.parentElement.previousElementSibling;
          if (parentPrev) {
            const text = this.extractTextContent(parentPrev);
            if (text) {
              results.push({
                text,
                distance: level + 1,
                source: `parent-prev-L${level}`
              });
            }
          }
        }
        
        // Move up one level
        currentElement = currentElement.parentElement;
        level++;
      }
      
      return results;
    }
    
    // Search nearby text nodes within pixel distance
    searchNearbyTextNodes(field, maxDistance) {
      const results = [];
      const fieldRect = field.getBoundingClientRect();
      const fieldCenter = {
        x: fieldRect.left + fieldRect.width / 2,
        y: fieldRect.top + fieldRect.height / 2
      };
      
      // Create a TreeWalker to find text nodes
      const walker = document.createTreeWalker(
        field.parentElement?.parentElement || document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            const text = node.textContent.trim();
            if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
            
            // Skip if inside form controls
            const parent = node.parentElement;
            if (parent && parent.matches('input, select, textarea, button, script, style')) {
              return NodeFilter.FILTER_REJECT;
            }
            
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );
      
      let node;
      while (node = walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        
        // Calculate distance from field
        const nodeCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
        
        const distance = Math.sqrt(
          Math.pow(nodeCenter.x - fieldCenter.x, 2) + 
          Math.pow(nodeCenter.y - fieldCenter.y, 2)
        );
        
        if (distance <= maxDistance) {
          results.push({
            text: node.textContent.trim(),
            distance: Math.round(distance)
          });
        }
      }
      
      // Sort by distance
      results.sort((a, b) => a.distance - b.distance);
      
      return results;
    }
    
    // Find label from table header
    findTableHeaderLabel(field) {
      const td = field.closest('td');
      if (!td) return null;
      
      const tr = td.closest('tr');
      if (!tr) return null;
      
      const table = tr.closest('table');
      if (!table) return null;
      
      // Get column index
      const cellIndex = Array.from(tr.cells).indexOf(td);
      if (cellIndex === -1) return null;
      
      // Look for header rows
      const headerRows = table.querySelectorAll('thead tr, tr:first-child');
      
      for (const headerRow of headerRows) {
        const headerCell = headerRow.cells[cellIndex];
        if (headerCell) {
          const text = this.extractTextContent(headerCell);
          if (text) return text;
        }
      }
      
      return null;
    }
    
    
    // Clean label text by removing extra whitespace, special characters, and common suffixes
    cleanLabelText(text) {
      if (!text) return '';
      
      let cleaned = text.trim();
      
      // Normalize whitespace and line breaks
      cleaned = cleaned
        .replace(/[\r\n]+/g, ' ') // Replace line breaks with spaces
        .replace(/\s+/g, ' ') // Normalize multiple spaces
        .replace(/\t+/g, ' '); // Replace tabs with spaces
      
      // Remove common form indicators
      cleaned = cleaned
        .replace(/\s*[:：]\s*$/, '') // Remove trailing colons (including fullwidth)
        .replace(/\s*[*＊]\s*$/, '') // Remove trailing asterisks
        .replace(/^\s*[*＊]\s*/, '') // Remove leading asterisks
        .replace(/\s*\(?\s*required\s*\)?\s*$/i, '') // Remove "required" indicators
        .replace(/\s*\(?\s*optional\s*\)?\s*$/i, '') // Remove "optional" indicators
        .replace(/\s*\(?\s*mandatory\s*\)?\s*$/i, '') // Remove "mandatory" indicators
        .replace(/\s*\(\s*\*\s*\)\s*$/, '') // Remove "(*)" pattern
        .replace(/\s*-\s*$/, '') // Remove trailing hyphens
        .replace(/^\s*-\s*/, '') // Remove leading hyphens
        .replace(/\s*\|\s*$/, '') // Remove trailing pipes
        .replace(/^\s*\|\s*/, ''); // Remove leading pipes
      
      // Remove field indicators
      cleaned = cleaned
        .replace(/\s*\(?\s*field\s*\)?\s*$/i, '') // Remove "field" suffix
        .replace(/\s*\(?\s*input\s*\)?\s*$/i, '') // Remove "input" suffix
        .replace(/^(enter|input|type|provide)\s+/i, ''); // Remove instructional prefixes
      
      // Remove HTML entities
      const temp = document.createElement('div');
      temp.innerHTML = cleaned;
      cleaned = temp.textContent || temp.innerText || cleaned;
      
      // Final trim and normalization
      cleaned = cleaned.trim();
      
      // Ensure first letter is capitalized if all lowercase
      if (cleaned && cleaned === cleaned.toLowerCase()) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
      
      return cleaned;
    }
    
    // Convert technical names to human-readable format
    humanizeName(name) {
      return name
        .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
        .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between camelCase
        .replace(/\b\w/g, l => l.toUpperCase()) // Capitalize first letter of each word
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    }
    
    getUIData() {
      return {
        sections: this.sections,
        fields: this.fields,
        fieldCount: this.fields.length
      };
    }
  }
  
  // Simple messaging
  const messaging = {
    async send(message) {
      return new Promise((resolve) => {
        try {
          if (!chrome?.runtime?.sendMessage) {
            resolve({ success: false });
            return;
          }
          
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[BRA] Message error:', chrome.runtime.lastError.message);
              resolve({ success: false });
            } else {
              resolve(response || { success: true });
            }
          });
        } catch (error) {
          console.error('[BRA] Message error:', error);
          resolve({ success: false });
        }
      });
    }
  };
  
  // Message handlers
  const messageHandlers = {
    ping: () => ({ alive: true, timestamp: Date.now() }),
    
    getDetectionStatus: () => ({
      hasResult: !!stateManager.getDetection(),
      result: stateManager.getDetection(),
      isRunning: stateManager.isDetecting
    }),
    
    getDetectionResult: () => {
      const result = stateManager.getDetection();
      if (result) return result;
      
      // No result, trigger detection
      runDetection('manual request');
      return {
        isBusinessRegistrationForm: false,
        confidenceScore: 0,
        message: 'Detection in progress'
      };
    },
    
    triggerDetection: () => {
      runDetection('manual trigger');
      return { scheduled: true };
    }
  };
  
  // Initialize state manager
  const stateManager = new DetectionStateManager();
  
  // Main detection function
  async function runDetection(reason) {
    if (!stateManager.shouldRunDetection()) {
      return;
    }
    
    console.log(`[BRA] Running detection due to: ${reason}`);
    
    // Clear previous detection
    stateManager.clearDetection();
    
    // Mark as running
    stateManager.startDetection();
    
    try {
      // Notify panel that we're detecting
      await messaging.send({
        action: 'detectionStarted',
        reason: reason,
        url: window.location.href
      });
      
      // Run detection
      const detector = new FieldDetector();
      const fields = await detector.detectFields();
      const uiData = detector.getUIData();
      
      // Build result
      const result = {
        timestamp: Date.now(),
        url: window.location.href,
        isBusinessRegistrationForm: fields.length > 3, // Simple heuristic
        confidenceScore: fields.length > 3 ? 70 : 20,
        fieldDetection: {
          isDetected: fields.length > 0,
          fields: fields,
          uiData: uiData,
          classifiedFields: fields.length
        }
      };
      
      // Save result
      stateManager.saveDetection(result);
      
      // Send to background
      await messaging.send({
        action: 'formDetected',
        result: result
      });
      
      console.log('[BRA] Detection complete');
      
    } catch (error) {
      console.error('[BRA] Detection error:', error);
    } finally {
      stateManager.endDetection();
    }
  }
  
  // Initialize change detector
  const changeDetector = new ChangeDetector((reason) => {
    runDetection(reason);
  });
  
  // Set up message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = messageHandlers[message.action];
    if (handler) {
      const response = handler(message);
      sendResponse(response);
    } else {
      sendResponse({ success: false, error: 'Unknown action' });
    }
    return true;
  });
  
  // Initial detection after a short delay
  setTimeout(() => {
    runDetection('initial page load');
  }, 1000);
  
  // Notify that we're ready
  messaging.send({
    action: 'contentScriptReady',
    url: window.location.href
  });
  
  console.log('[BRA] Auto-detection content script ready');
  
  // Cleanup on unload
  window.addEventListener('unload', () => {
    changeDetector.destroy();
  });
  
})();