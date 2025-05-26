/**
 * Business Registration Assistant - Enhanced Content Script
 * Complete field detection with proper classification and UI data
 */

(function() {
  'use strict';
  
  // Skip if already initialized
  if (window.__braContentScriptEnhanced) {
    return;
  }
  window.__braContentScriptEnhanced = true;
  
  console.log('[BRA] Initializing enhanced content script');
  
  // ============= ENHANCED FIELD DETECTOR =============
  class EnhancedFieldDetector {
    constructor(config = {}) {
      this.root = config.root || document.body || document.documentElement;
      this.urlInfo = config.urlInfo || null;
      this.maxElements = 1000;
      this.timeout = 3000;
      this.detectedFields = [];
      this.sections = [];
      this.categories = {};
    }
    
    async detectFields() {
      console.log('[BRA FieldDetector] Starting field detection');
      const startTime = Date.now();
      this.detectedFields = [];
      this.sections = [];
      this.categories = {};
      
      try {
        // Find all forms on the page
        const forms = Array.from(this.root.querySelectorAll('form') || []);
        console.log(`[BRA FieldDetector] Found ${forms.length} forms`);
        
        // If no forms, scan entire document
        const containers = forms.length > 0 ? forms : [this.root];
        
        for (const container of containers) {
          await this.scanContainer(container, startTime);
        }
        
        // Also find fields outside forms
        if (forms.length > 0) {
          await this.scanOrphanedFields(startTime);
        }
        
        // Organize fields into sections and categories
        this.organizeFields();
        
        console.log(`[BRA FieldDetector] Detection complete. Found ${this.detectedFields.length} fields`);
        
      } catch (error) {
        console.error('[BRA FieldDetector] Error detecting fields:', error);
      }
      
      return this.detectedFields;
    }
    
    async scanContainer(container, startTime) {
      // Find all input elements
      const inputs = Array.from(container.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])') || []);
      const selects = Array.from(container.querySelectorAll('select') || []);
      const textareas = Array.from(container.querySelectorAll('textarea') || []);
      
      const elements = [...inputs, ...selects, ...textareas];
      
      console.log(`[BRA FieldDetector] Scanning ${elements.length} elements in container`);
      
      // Process elements
      for (const element of elements) {
        // Check timeout
        if (Date.now() - startTime > this.timeout) {
          console.warn('[BRA FieldDetector] Detection timeout');
          break;
        }
        
        // Skip if not visible
        if (!this.isElementVisible(element)) continue;
        
        // Skip if already processed
        if (element.dataset.braProcessed) continue;
        element.dataset.braProcessed = 'true';
        
        // Extract field information
        const field = await this.extractFieldInfo(element);
        if (field) {
          this.detectedFields.push(field);
          console.log(`[BRA FieldDetector] Found field: ${field.label.text} (${field.classification.category})`);
        }
      }
      
      // Look for radio/checkbox groups
      await this.findFieldGroups(container);
    }
    
    async scanOrphanedFields(startTime) {
      // Find fields that might be outside forms
      const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not(form input), select:not(form select), textarea:not(form textarea)';
      const orphaned = Array.from(this.root.querySelectorAll(selector) || []);
      
      for (const element of orphaned) {
        if (Date.now() - startTime > this.timeout) break;
        if (!this.isElementVisible(element)) continue;
        if (element.dataset.braProcessed) continue;
        
        element.dataset.braProcessed = 'true';
        const field = await this.extractFieldInfo(element);
        if (field) {
          this.detectedFields.push(field);
        }
      }
    }
    
    isElementVisible(element) {
      try {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        
        // Check if element has size
        if (rect.width === 0 || rect.height === 0) return false;
        
        // Check visibility
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        
        // Check if in viewport (with some tolerance)
        const inViewport = rect.top < window.innerHeight + 100 && rect.bottom > -100;
        
        return inViewport;
      } catch (e) {
        return false;
      }
    }
    
    async extractFieldInfo(element) {
      try {
        const field = {
          element: element,
          type: element.type || element.tagName.toLowerCase(),
          name: element.name || '',
          id: element.id || '',
          label: await this.findLabel(element),
          placeholder: element.placeholder || '',
          required: element.required || element.getAttribute('aria-required') === 'true',
          value: element.value || '',
          position: this.getElementPosition(element),
          attributes: this.getElementAttributes(element)
        };
        
        // Classify the field
        field.classification = this.classifyField(field);
        
        // Add index for ordering
        field.index = this.detectedFields.length;
        
        return field;
      } catch (error) {
        console.error('[BRA FieldDetector] Error extracting field info:', error);
        return null;
      }
    }
    
    async findLabel(element) {
      try {
        // 1. Check for aria-label
        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel && ariaLabel.trim()) {
          return { text: ariaLabel.trim(), type: 'aria' };
        }
        
        // 2. Check for aria-labelledby
        const ariaLabelledBy = element.getAttribute('aria-labelledby');
        if (ariaLabelledBy) {
          const labelElement = document.getElementById(ariaLabelledBy);
          if (labelElement && labelElement.textContent.trim()) {
            return { text: labelElement.textContent.trim(), type: 'aria-labelledby' };
          }
        }
        
        // 3. Check for associated label via for attribute
        if (element.id) {
          const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
          if (label && label.textContent.trim()) {
            return { text: this.cleanLabelText(label.textContent), type: 'for' };
          }
        }
        
        // 4. Check for parent label
        const parentLabel = element.closest('label');
        if (parentLabel) {
          // Get text excluding the input element itself
          const labelClone = parentLabel.cloneNode(true);
          const inputsInLabel = labelClone.querySelectorAll('input, select, textarea');
          inputsInLabel.forEach(el => el.remove());
          const text = labelClone.textContent.trim();
          if (text) {
            return { text: this.cleanLabelText(text), type: 'parent' };
          }
        }
        
        // 5. Check for nearby text elements
        const nearbyLabel = this.findNearbyLabel(element);
        if (nearbyLabel) {
          return { text: this.cleanLabelText(nearbyLabel), type: 'nearby' };
        }
        
        // 6. Use placeholder as fallback
        if (element.placeholder && element.placeholder.trim()) {
          return { text: element.placeholder.trim(), type: 'placeholder' };
        }
        
        // 7. Use name attribute as last resort
        if (element.name) {
          // Convert name to readable format
          const readable = element.name
            .replace(/[-_]/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .trim()
            .replace(/\s+/g, ' ');
          return { text: readable, type: 'name' };
        }
        
        return { text: 'Unlabeled field', type: 'none' };
      } catch (e) {
        console.error('[BRA FieldDetector] Error finding label:', e);
        return { text: '', type: 'error' };
      }
    }
    
    findNearbyLabel(element) {
      try {
        // Look for text in the same container
        const parent = element.parentElement;
        if (!parent) return null;
        
        // Check previous sibling
        let prevSibling = element.previousElementSibling;
        if (prevSibling && prevSibling.textContent.trim() && prevSibling.textContent.length < 100) {
          return prevSibling.textContent.trim();
        }
        
        // Check text nodes before element
        const walker = document.createTreeWalker(
          parent,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: function(node) {
              return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
          }
        );
        
        let node;
        let lastText = '';
        while (node = walker.nextNode()) {
          if (node.nextSibling === element || (node.parentElement && node.parentElement.nextElementSibling === element)) {
            lastText = node.textContent.trim();
          }
        }
        
        if (lastText && lastText.length < 100) {
          return lastText;
        }
        
        // Check parent's text content (excluding children)
        const parentClone = parent.cloneNode(true);
        const children = parentClone.querySelectorAll('*');
        children.forEach(child => child.remove());
        const parentText = parentClone.textContent.trim();
        if (parentText && parentText.length < 100) {
          return parentText;
        }
        
        return null;
      } catch (e) {
        return null;
      }
    }
    
    cleanLabelText(text) {
      return text
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[*:]$/, '')
        .trim();
    }
    
    getElementPosition(element) {
      try {
        const rect = element.getBoundingClientRect();
        return {
          top: Math.round(rect.top + window.scrollY),
          left: Math.round(rect.left + window.scrollX),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      } catch (e) {
        return { top: 0, left: 0, width: 0, height: 0 };
      }
    }
    
    getElementAttributes(element) {
      const attrs = {};
      try {
        // Get relevant attributes
        ['maxlength', 'pattern', 'min', 'max', 'step', 'autocomplete', 'data-field-type'].forEach(attr => {
          const value = element.getAttribute(attr);
          if (value) attrs[attr] = value;
        });
      } catch (e) {
        // Ignore
      }
      return attrs;
    }
    
    async findFieldGroups(container) {
      // Find radio button groups
      const radioGroups = new Map();
      const radios = Array.from(container.querySelectorAll('input[type="radio"]') || []);
      
      radios.forEach(radio => {
        if (!radio.name || !this.isElementVisible(radio) || radio.dataset.braProcessed) return;
        
        if (!radioGroups.has(radio.name)) {
          radioGroups.set(radio.name, {
            type: 'radio_group',
            name: radio.name,
            options: [],
            label: { text: '', type: 'group' },
            position: this.getElementPosition(radio),
            required: radio.required,
            classification: { category: 'single_select', confidence: 85 }
          });
        }
        
        const group = radioGroups.get(radio.name);
        group.options.push({
          value: radio.value,
          label: this.findRadioLabel(radio),
          checked: radio.checked
        });
        
        radio.dataset.braProcessed = 'true';
      });
      
      // Process radio groups
      for (const [name, group] of radioGroups) {
        // Find the best label for the group
        const firstRadio = container.querySelector(`input[type="radio"][name="${CSS.escape(name)}"]`);
        if (firstRadio) {
          const fieldset = firstRadio.closest('fieldset');
          if (fieldset) {
            const legend = fieldset.querySelector('legend');
            if (legend) {
              group.label = { text: this.cleanLabelText(legend.textContent), type: 'legend' };
            }
          }
          
          // If no legend, try to find a common label
          if (group.label.text === '') {
            const commonLabel = this.findCommonGroupLabel(firstRadio);
            if (commonLabel) {
              group.label = { text: commonLabel, type: 'common' };
            } else {
              group.label = { text: name.replace(/[-_]/g, ' '), type: 'name' };
            }
          }
        }
        
        // Re-classify based on group label
        group.classification = this.classifyField(group);
        
        this.detectedFields.push(group);
        console.log(`[BRA FieldDetector] Found radio group: ${group.label.text} with ${group.options.length} options`);
      }
      
      // Find checkbox groups (multiple checkboxes with same name[] or similar pattern)
      await this.findCheckboxGroups(container);
    }
    
    findRadioLabel(radio) {
      const label = this.findLabel(radio);
      return label.text || radio.value;
    }
    
    findCommonGroupLabel(element) {
      // Look for heading or label above the group
      let current = element.parentElement;
      let depth = 0;
      
      while (current && depth < 5) {
        // Check for headings
        const heading = current.querySelector('h1, h2, h3, h4, h5, h6, .form-label, .field-label');
        if (heading && heading.textContent.trim()) {
          return this.cleanLabelText(heading.textContent);
        }
        
        // Check previous siblings
        let prev = current.previousElementSibling;
        if (prev && prev.textContent.trim() && prev.textContent.length < 100) {
          return this.cleanLabelText(prev.textContent);
        }
        
        current = current.parentElement;
        depth++;
      }
      
      return null;
    }
    
    async findCheckboxGroups(container) {
      // Implementation for checkbox groups
      // Similar to radio groups but for checkboxes with similar names
    }
    
    classifyField(field) {
      const labelText = (field.label?.text || '').toLowerCase();
      const fieldName = (field.name || '').toLowerCase();
      const fieldId = (field.id || '').toLowerCase();
      const fieldType = (field.type || '').toLowerCase();
      const placeholder = (field.placeholder || '').toLowerCase();
      const combined = `${labelText} ${fieldName} ${fieldId} ${placeholder}`.toLowerCase();
      
      // Business name variations
      if (combined.match(/business\s*name|company\s*name|legal\s*name|organization\s*name|entity\s*name|corp\s*name|llc\s*name|firm\s*name/)) {
        return { category: 'business_name', confidence: 95 };
      }
      
      // DBA/Trade name
      if (combined.match(/dba|doing\s*business|trade\s*name|fictitious\s*name|assumed\s*name/)) {
        return { category: 'dba', confidence: 90 };
      }
      
      // EIN/Tax ID
      if (combined.match(/ein|employer\s*id|federal\s*tax|tax\s*id|fein/)) {
        return { category: 'ein', confidence: 95 };
      }
      
      // SSN
      if (combined.match(/ssn|social\s*security/)) {
        return { category: 'ssn', confidence: 95 };
      }
      
      // Entity type
      if (combined.match(/entity\s*type|business\s*type|organization\s*type|structure|incorporation|legal\s*structure/)) {
        return { category: 'entity_type', confidence: 90 };
      }
      
      // Email
      if (fieldType === 'email' || combined.match(/email|e-mail|electronic\s*mail/)) {
        return { category: 'email', confidence: 95 };
      }
      
      // Phone
      if (fieldType === 'tel' || combined.match(/phone|telephone|tel|mobile|cell|fax|contact\s*number/)) {
        return { category: 'phone', confidence: 90 };
      }
      
      // Address fields
      if (combined.match(/street|address\s*1|address\s*line|mailing\s*address|physical\s*address|business\s*address/) && !combined.includes('email')) {
        return { category: 'address', confidence: 85 };
      }
      
      if (combined.match(/address\s*2|suite|apt|unit\s*number/)) {
        return { category: 'address2', confidence: 85 };
      }
      
      // City
      if (combined.match(/city|town|municipality|locale/)) {
        return { category: 'city', confidence: 90 };
      }
      
      // State
      if (combined.match(/\bstate\b|province|region/) && !combined.includes('statement') && !combined.includes('state of')) {
        return { category: 'state', confidence: 85 };
      }
      
      // ZIP
      if (combined.match(/zip|postal\s*code|postcode/)) {
        return { category: 'zip', confidence: 90 };
      }
      
      // County
      if (combined.match(/county/)) {
        return { category: 'county', confidence: 85 };
      }
      
      // Country
      if (combined.match(/country/)) {
        return { category: 'country', confidence: 85 };
      }
      
      // Owner/Principal name
      if (combined.match(/owner|principal|proprietor|member\s*name|contact\s*name|your\s*name|first\s*name|last\s*name/)) {
        return { category: 'owner_name', confidence: 80 };
      }
      
      // Registered agent
      if (combined.match(/registered\s*agent|statutory\s*agent|resident\s*agent/)) {
        return { category: 'registered_agent', confidence: 90 };
      }
      
      // NAICS code
      if (combined.match(/naics|industry\s*code|business\s*code|sic\s*code/)) {
        return { category: 'naics_code', confidence: 85 };
      }
      
      // Business purpose/description
      if (combined.match(/purpose|description|nature\s*of\s*business|business\s*activity/)) {
        return { category: 'business_purpose', confidence: 80 };
      }
      
      // Date fields
      if (fieldType === 'date' || combined.match(/date|established|incorporation\s*date|start\s*date/)) {
        return { category: 'date', confidence: 85 };
      }
      
      // Number fields
      if (fieldType === 'number' || combined.match(/number\s*of\s*employees|employee\s*count/)) {
        return { category: 'number', confidence: 75 };
      }
      
      // Select fields
      if (fieldType === 'select-one' || field.type === 'radio_group') {
        return { category: 'single_select', confidence: 70 };
      }
      
      if (fieldType === 'select-multiple' || field.type === 'checkbox_group') {
        return { category: 'multi_select', confidence: 70 };
      }
      
      // Checkbox
      if (fieldType === 'checkbox') {
        return { category: 'boolean', confidence: 70 };
      }
      
      // Default
      return { category: 'other', confidence: 50 };
    }
    
    organizeFields() {
      // Group fields by position to detect sections
      const fieldsByPosition = this.detectedFields.sort((a, b) => {
        const topDiff = a.position.top - b.position.top;
        if (Math.abs(topDiff) > 20) return topDiff;
        return a.position.left - b.position.left;
      });
      
      // Group into sections based on visual proximity
      let currentSection = null;
      let lastTop = -1;
      const sectionGap = 100; // Pixels between sections
      
      fieldsByPosition.forEach((field, index) => {
        // Check if we need a new section
        if (!currentSection || field.position.top - lastTop > sectionGap) {
          // Try to find section title
          const sectionTitle = this.findSectionTitle(field.element) || `Section ${this.sections.length + 1}`;
          
          currentSection = {
            label: sectionTitle,
            fields: []
          };
          this.sections.push(currentSection);
        }
        
        currentSection.fields.push(field);
        lastTop = field.position.top;
      });
      
      // Also organize by category
      this.detectedFields.forEach(field => {
        const category = field.classification.category;
        if (!this.categories[category]) {
          this.categories[category] = {
            label: this.getCategoryLabel(category),
            fields: []
          };
        }
        this.categories[category].fields.push(field);
      });
      
      console.log(`[BRA FieldDetector] Organized into ${this.sections.length} sections and ${Object.keys(this.categories).length} categories`);
    }
    
    findSectionTitle(element) {
      // Look for section headings near the field
      let current = element.parentElement;
      let depth = 0;
      
      while (current && depth < 5) {
        // Check for fieldset legend
        if (current.tagName === 'FIELDSET') {
          const legend = current.querySelector('legend');
          if (legend) return this.cleanLabelText(legend.textContent);
        }
        
        // Check for headings before this section
        const prevHeading = this.findPreviousHeading(current);
        if (prevHeading) return prevHeading;
        
        current = current.parentElement;
        depth++;
      }
      
      return null;
    }
    
    findPreviousHeading(element) {
      let current = element.previousElementSibling;
      let attempts = 0;
      
      while (current && attempts < 5) {
        if (current.matches('h1, h2, h3, h4, h5, h6, .section-title, .form-section-title')) {
          return this.cleanLabelText(current.textContent);
        }
        current = current.previousElementSibling;
        attempts++;
      }
      
      return null;
    }
    
    getCategoryLabel(category) {
      const labels = {
        'business_name': 'Business Name',
        'dba': 'DBA/Trade Name',
        'ein': 'EIN/Tax ID',
        'ssn': 'SSN',
        'entity_type': 'Entity Type',
        'email': 'Email',
        'phone': 'Phone',
        'address': 'Address',
        'address2': 'Address Line 2',
        'city': 'City',
        'state': 'State',
        'zip': 'ZIP Code',
        'county': 'County',
        'country': 'Country',
        'owner_name': 'Owner/Principal',
        'registered_agent': 'Registered Agent',
        'naics_code': 'Industry Code',
        'business_purpose': 'Business Purpose',
        'date': 'Date Fields',
        'number': 'Numeric Fields',
        'single_select': 'Selection Fields',
        'multi_select': 'Multiple Choice',
        'boolean': 'Checkboxes',
        'other': 'Other Fields'
      };
      
      return labels[category] || category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    
    getUIData() {
      return {
        sections: this.sections,
        categories: this.categories,
        summary: {
          totalFields: this.detectedFields.length,
          byCategory: Object.keys(this.categories).reduce((acc, cat) => {
            acc[cat] = this.categories[cat].fields.length;
            return acc;
          }, {}),
          confidence: this.calculateOverallConfidence()
        }
      };
    }
    
    calculateOverallConfidence() {
      if (this.detectedFields.length === 0) return 0;
      
      const totalConfidence = this.detectedFields.reduce((sum, field) => {
        return sum + (field.classification.confidence || 0);
      }, 0);
      
      return Math.round(totalConfidence / this.detectedFields.length);
    }
  }
  
  // ============= MESSAGING CLASS (INLINED) =============
  class ContentMessaging {
    constructor() {
      this.messageHandlers = new Map();
      this.messageId = 0;
      this.isConnected = true;
      this.setupMessageListener();
    }
    
    registerHandler(action, handler) {
      this.messageHandlers.set(action, handler);
    }
    
    async sendMessage(message, options = {}) {
      const messageId = ++this.messageId;
      message.messageId = messageId;
      message.timestamp = Date.now();
      
      return new Promise((resolve) => {
        try {
          if (!chrome?.runtime?.sendMessage) {
            resolve({ success: false, error: 'No messaging API' });
            return;
          }
          
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[ContentMessaging] Error:', chrome.runtime.lastError.message);
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(response || {});
            }
          });
        } catch (error) {
          console.error('[ContentMessaging] Exception:', error);
          resolve({ success: false, error: error.message });
        }
      });
    }
    
    setupMessageListener() {
      if (!chrome?.runtime?.onMessage) return;
      
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender).then(response => {
          sendResponse(response || { received: true });
        }).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
        return true;
      });
    }
    
    async handleMessage(message, sender) {
      const handler = this.messageHandlers.get(message.action);
      if (handler) {
        try {
          const result = await handler(message, sender);
          return { success: true, ...result };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
      return { success: false, error: 'Unknown action' };
    }
  }
  
  // ============= URL DETECTOR (INLINED) =============
  const URLDetector = {
    analyzeUrl(url) {
      try {
        const urlString = typeof url === 'string' ? url : (url?.href || url?.toString() || '');
        const hostname = new URL(urlString).hostname.toLowerCase();
        
        const isGov = hostname.includes('.gov') || 
                     hostname.includes('.state.') ||
                     hostname.includes('.us');
        
        let state = null;
        const statePatterns = {
          'CA': /california|\.ca\.gov/i,
          'NY': /newyork|\.ny\.gov/i,
          'TX': /texas|\.tx\.gov/i,
          'FL': /florida|\.fl\.gov/i,
          'DC': /dc\.gov|district.*columbia/i,
          'DE': /delaware|\.de\.gov/i
        };
        
        for (const [code, pattern] of Object.entries(statePatterns)) {
          if (pattern.test(urlString)) {
            state = code;
            break;
          }
        }
        
        return {
          isGovernmentSite: isGov,
          score: isGov ? 80 : 20,
          state: state
        };
      } catch (error) {
        return { isGovernmentSite: false, score: 0, state: null };
      }
    }
  };
  
  // ============= MAIN CONTENT SCRIPT =============
  const messaging = new ContentMessaging();
  
  const state = {
    detection: {
      isRunning: false,
      lastResult: null,
      lastRun: 0,
      attempts: 0
    },
    debounceTimer: null
  };
  
  const CONFIG = {
    DEBOUNCE_DELAY: 500,
    MIN_TIME_BETWEEN_RUNS: 1000,
    DETECTION_TIMEOUT: 5000
  };
  
  // Register message handlers
  function registerHandlers() {
    messaging.registerHandler('ping', async () => ({
      alive: true,
      timestamp: Date.now(),
      detectionStatus: {
        hasResult: !!state.detection.lastResult,
        isRunning: state.detection.isRunning
      }
    }));
    
    messaging.registerHandler('getDetectionStatus', async () => ({
      hasResult: !!state.detection.lastResult,
      result: state.detection.lastResult,
      isRunning: state.detection.isRunning
    }));
    
    messaging.registerHandler('getDetectionResult', async () => {
      if (state.detection.lastResult) {
        return state.detection.lastResult;
      }
      if (!state.detection.isRunning) {
        scheduleDetection();
      }
      return {
        isBusinessRegistrationForm: false,
        confidenceScore: 0,
        message: 'Detection in progress'
      };
    });
    
    messaging.registerHandler('triggerDetection', async () => {
      scheduleDetection();
      return {
        scheduled: true,
        hasResult: !!state.detection.lastResult,
        result: state.detection.lastResult
      };
    });
  }
  
  function scheduleDetection() {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }
    
    const now = Date.now();
    if (now - state.detection.lastRun < CONFIG.MIN_TIME_BETWEEN_RUNS) {
      return;
    }
    
    state.debounceTimer = setTimeout(() => {
      runDetection();
    }, CONFIG.DEBOUNCE_DELAY);
  }
  
  async function runDetection() {
    if (state.detection.isRunning) return;
    
    console.log('[BRA] Starting detection');
    state.detection.isRunning = true;
    state.detection.lastRun = Date.now();
    
    try {
      const result = {
        timestamp: Date.now(),
        url: window.location.href,
        isBusinessRegistrationForm: false,
        confidenceScore: 0,
        urlDetection: null,
        fieldDetection: null
      };
      
      // URL detection
      result.urlDetection = URLDetector.analyzeUrl(window.location);
      console.log('[BRA] URL detection:', result.urlDetection);
      
      // Field detection
      const detector = new EnhancedFieldDetector({
        root: document.body,
        urlInfo: result.urlDetection
      });
      
      const fields = await detector.detectFields();
      const uiData = detector.getUIData();
      
      result.fieldDetection = {
        isDetected: fields.length > 0,
        fields: fields,
        uiData: uiData,
        confidence: uiData.summary.confidence,
        state: result.urlDetection.state,
        classifiedFields: fields.length,
        categories: Object.keys(uiData.categories).length
      };
      
      console.log('[BRA] Field detection complete:', {
        fields: fields.length,
        sections: uiData.sections.length,
        categories: Object.keys(uiData.categories).length
      });
      
      // Calculate overall result
      const urlScore = result.urlDetection?.score || 0;
      const fieldScore = fields.length > 0 ? uiData.summary.confidence : 0;
      result.confidenceScore = Math.round((urlScore * 0.3 + fieldScore * 0.7));
      result.isBusinessRegistrationForm = result.confidenceScore > 40 && fields.length > 0;
      result.state = result.urlDetection.state;
      
      // Store result
      state.detection.lastResult = result;
      
      // Send to background
      await messaging.sendMessage({
        action: 'formDetected',
        result: result
      });
      
      console.log('[BRA] Detection complete:', result);
      
    } catch (error) {
      console.error('[BRA] Detection error:', error);
      state.detection.lastResult = {
        isBusinessRegistrationForm: false,
        confidenceScore: 0,
        error: error.message
      };
    } finally {
      state.detection.isRunning = false;
    }
  }
  
  // Initialize
  async function initialize() {
    try {
      console.log('[BRA] Initializing enhanced content script');
      
      registerHandlers();
      
      await messaging.sendMessage({
        action: 'contentScriptReady',
        url: window.location.href
      });
      
      // Initial detection
      setTimeout(() => {
        scheduleDetection();
      }, 1000);
      
      // Set up observers
      if (document.body) {
        const observer = new MutationObserver(() => {
          if (!state.detection.lastResult?.isBusinessRegistrationForm) {
            scheduleDetection();
          }
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
      
      console.log('[BRA] Enhanced content script ready');
      
    } catch (error) {
      console.error('[BRA] Initialization error:', error);
    }
  }
  
  initialize();
  
})();