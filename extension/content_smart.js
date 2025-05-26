/**
 * Business Registration Assistant - Smart Content Script
 * Properly groups form elements and detects visual sections
 */

(function() {
  'use strict';
  
  // Skip if already initialized
  if (window.__braContentScriptSmart) {
    return;
  }
  window.__braContentScriptSmart = true;
  
  console.log('[BRA] Initializing smart content script');
  
  // ============= SMART FIELD DETECTOR =============
  class SmartFieldDetector {
    constructor(config = {}) {
      this.root = config.root || document.body;
      this.detectedFields = [];
      this.sections = [];
      this.processedElements = new Set();
      this.radioGroups = new Map();
      this.checkboxGroups = new Map();
    }
    
    async detectFields() {
      console.log('[BRA] Starting smart field detection');
      this.detectedFields = [];
      this.sections = [];
      this.processedElements.clear();
      this.radioGroups.clear();
      this.checkboxGroups.clear();
      
      try {
        // First, find all section headers in the document
        const sectionHeaders = this.findSectionHeaders();
        console.log(`[BRA] Found ${sectionHeaders.length} section headers`);
        
        // Process each section
        if (sectionHeaders.length > 0) {
          for (const header of sectionHeaders) {
            await this.processSection(header);
          }
          
          // Process any fields that weren't in sections
          await this.processOrphanedFields();
        } else {
          // No clear sections, process entire page as one section
          await this.processContainer(this.root, 'Form Fields');
        }
        
        console.log(`[BRA] Detection complete. Found ${this.detectedFields.length} fields in ${this.sections.length} sections`);
        
      } catch (error) {
        console.error('[BRA] Field detection error:', error);
      }
      
      return this.detectedFields;
    }
    
    findSectionHeaders() {
      // Find all potential section headers
      const headerSelectors = [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'legend',
        '.section-title', '.form-section', '.form-header',
        '[role="heading"]',
        '.panel-heading', '.card-header'
      ];
      
      const headers = [];
      const headerElements = this.root.querySelectorAll(headerSelectors.join(', '));
      
      headerElements.forEach(element => {
        // Skip if not visible
        if (!this.isVisible(element)) return;
        
        // Skip if it's a page header (too high level)
        if (element.tagName === 'H1' && this.looksLikePageHeader(element)) return;
        
        // Check if this header has form fields after it
        const fieldsAfter = this.findFieldsAfterElement(element);
        if (fieldsAfter.length > 0) {
          headers.push({
            element: element,
            text: this.cleanText(element.textContent),
            level: this.getHeaderLevel(element),
            position: this.getElementPosition(element),
            fields: fieldsAfter
          });
        }
      });
      
      // Sort headers by position
      headers.sort((a, b) => a.position.top - b.position.top);
      
      // Remove overlapping sections
      const finalHeaders = [];
      let lastBottom = -1;
      
      headers.forEach(header => {
        if (header.position.top > lastBottom) {
          finalHeaders.push(header);
          const lastField = header.fields[header.fields.length - 1];
          lastBottom = lastField ? this.getElementPosition(lastField).bottom : header.position.bottom;
        }
      });
      
      return finalHeaders;
    }
    
    looksLikePageHeader(element) {
      // Check if this is likely a page title rather than a section header
      const text = element.textContent.toLowerCase();
      const parent = element.parentElement;
      
      // Common page header patterns
      if (text.includes('registration') && text.includes('business')) return true;
      if (parent && parent.matches('header, .header, .page-header, .site-header')) return true;
      if (element.matches('.logo, .site-title, .page-title')) return true;
      
      return false;
    }
    
    getHeaderLevel(element) {
      const tagName = element.tagName;
      if (tagName.match(/^H(\d)$/)) {
        return parseInt(tagName.charAt(1));
      }
      if (tagName === 'LEGEND') return 3;
      return 4; // Default for other elements
    }
    
    findFieldsAfterElement(element) {
      const fields = [];
      const maxDistance = 500; // pixels
      const elementBottom = this.getElementPosition(element).bottom;
      
      // Find all form fields
      const allFields = this.root.querySelectorAll('input, select, textarea');
      
      allFields.forEach(field => {
        // Skip if already processed or not visible
        if (this.processedElements.has(field) || !this.isVisible(field)) return;
        
        const fieldPos = this.getElementPosition(field);
        
        // Check if field is after the header and within reasonable distance
        if (fieldPos.top >= elementBottom && 
            fieldPos.top - elementBottom < maxDistance) {
          fields.push(field);
        }
      });
      
      return fields;
    }
    
    async processSection(headerInfo) {
      console.log(`[BRA] Processing section: "${headerInfo.text}"`);
      
      const section = {
        label: headerInfo.text,
        fields: []
      };
      
      // Process fields in this section
      for (const field of headerInfo.fields) {
        if (this.processedElements.has(field)) continue;
        
        // Handle different field types
        if (field.type === 'radio') {
          await this.processRadioButton(field, section);
        } else if (field.type === 'checkbox') {
          await this.processCheckbox(field, section);
        } else {
          await this.processStandardField(field, section);
        }
      }
      
      // Add section if it has fields
      if (section.fields.length > 0) {
        this.sections.push(section);
        console.log(`[BRA] Section "${section.label}" has ${section.fields.length} fields`);
      }
    }
    
    async processContainer(container, sectionName) {
      const section = {
        label: sectionName,
        fields: []
      };
      
      // Find all fields in container
      const fields = container.querySelectorAll('input, select, textarea');
      
      for (const field of fields) {
        if (this.processedElements.has(field) || !this.isVisible(field)) continue;
        
        if (field.type === 'radio') {
          await this.processRadioButton(field, section);
        } else if (field.type === 'checkbox') {
          await this.processCheckbox(field, section);
        } else {
          await this.processStandardField(field, section);
        }
      }
      
      if (section.fields.length > 0) {
        this.sections.push(section);
      }
    }
    
    async processOrphanedFields() {
      // Find any fields we haven't processed yet
      const orphanedFields = [];
      const allFields = this.root.querySelectorAll('input, select, textarea');
      
      allFields.forEach(field => {
        if (!this.processedElements.has(field) && this.isVisible(field)) {
          orphanedFields.push(field);
        }
      });
      
      if (orphanedFields.length > 0) {
        console.log(`[BRA] Processing ${orphanedFields.length} orphaned fields`);
        await this.processContainer(this.root, 'Additional Fields');
      }
    }
    
    async processRadioButton(radio, section) {
      // Skip if already part of a processed group
      if (this.processedElements.has(radio)) return;
      
      const groupName = radio.name;
      if (!groupName) {
        // Treat as standalone field if no name
        await this.processStandardField(radio, section);
        return;
      }
      
      // Check if we've already processed this group
      if (this.radioGroups.has(groupName)) {
        this.processedElements.add(radio);
        return;
      }
      
      // Find all radios in this group
      const groupRadios = Array.from(
        this.root.querySelectorAll(`input[type="radio"][name="${CSS.escape(groupName)}"]`)
      ).filter(r => this.isVisible(r));
      
      console.log(`[BRA] Found radio group "${groupName}" with ${groupRadios.length} options`);
      
      // Mark all as processed
      groupRadios.forEach(r => this.processedElements.add(r));
      
      // Find the group label
      const groupLabel = this.findRadioGroupLabel(groupRadios);
      
      // Create the field group
      const fieldGroup = {
        type: 'radio_group',
        name: groupName,
        label: groupLabel,
        required: groupRadios.some(r => r.required),
        options: groupRadios.map(r => ({
          value: r.value,
          label: this.findRadioOptionLabel(r),
          checked: r.checked
        })),
        position: this.getElementPosition(groupRadios[0]),
        classification: this.classifyField({
          type: 'radio_group',
          label: groupLabel,
          name: groupName,
          options: groupRadios.length
        })
      };
      
      this.radioGroups.set(groupName, fieldGroup);
      section.fields.push(fieldGroup);
      this.detectedFields.push(fieldGroup);
    }
    
    async processCheckbox(checkbox, section) {
      // For checkboxes, we need to determine if it's part of a group
      const checkboxName = checkbox.name;
      
      // Look for related checkboxes
      if (checkboxName && (checkboxName.endsWith('[]') || this.hasRelatedCheckboxes(checkbox))) {
        // This is part of a checkbox group
        await this.processCheckboxGroup(checkbox, section);
      } else {
        // Standalone checkbox (like "I agree to terms")
        await this.processStandardField(checkbox, section);
      }
    }
    
    hasRelatedCheckboxes(checkbox) {
      // Check if there are other checkboxes with similar names or in same fieldset
      const fieldset = checkbox.closest('fieldset');
      if (fieldset) {
        const checkboxes = fieldset.querySelectorAll('input[type="checkbox"]');
        return checkboxes.length > 1;
      }
      
      // Check by proximity
      const parent = checkbox.closest('.form-group, .field-group, .checkbox-group');
      if (parent) {
        const checkboxes = parent.querySelectorAll('input[type="checkbox"]');
        return checkboxes.length > 1;
      }
      
      return false;
    }
    
    async processCheckboxGroup(checkbox, section) {
      // Similar to radio groups but for checkboxes
      // Implementation would be similar to processRadioButton
    }
    
    async processStandardField(field, section) {
      if (this.processedElements.has(field)) return;
      
      // Skip hidden fields
      if (field.type === 'hidden') return;
      
      this.processedElements.add(field);
      
      const fieldInfo = {
        type: field.type || field.tagName.toLowerCase(),
        name: field.name || '',
        id: field.id || '',
        label: this.findFieldLabel(field),
        placeholder: field.placeholder || '',
        required: field.required || field.getAttribute('aria-required') === 'true',
        value: field.value || '',
        position: this.getElementPosition(field),
        classification: null // Will be set below
      };
      
      // Special handling for select fields
      if (fieldInfo.type === 'select-one' || field.tagName === 'SELECT') {
        fieldInfo.options = Array.from(field.options).map(opt => ({
          value: opt.value,
          label: opt.text,
          selected: opt.selected
        }));
      }
      
      // Classify the field
      fieldInfo.classification = this.classifyField(fieldInfo);
      
      section.fields.push(fieldInfo);
      this.detectedFields.push(fieldInfo);
      
      console.log(`[BRA] Found field: "${fieldInfo.label.text}" (${fieldInfo.classification.category})`);
    }
    
    findRadioGroupLabel(radios) {
      // Try multiple strategies to find the group label
      
      // 1. Check for fieldset legend
      const fieldset = radios[0].closest('fieldset');
      if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend) return { text: this.cleanText(legend.textContent), type: 'legend' };
      }
      
      // 2. Look for a common parent with a label
      const commonParent = this.findCommonParent(radios);
      if (commonParent) {
        // Look for heading or label-like element before the first radio
        const labelElement = this.findPrecedingLabel(radios[0], commonParent);
        if (labelElement) {
          return { text: this.cleanText(labelElement.textContent), type: 'preceding' };
        }
      }
      
      // 3. Check for aria-labelledby on the group
      const labelledBy = radios[0].getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelElement = document.getElementById(labelledBy);
        if (labelElement) {
          return { text: this.cleanText(labelElement.textContent), type: 'aria' };
        }
      }
      
      // 4. Use the name as fallback
      const name = radios[0].name;
      return { 
        text: name.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
        type: 'name' 
      };
    }
    
    findRadioOptionLabel(radio) {
      // Find label for individual radio option
      const label = this.findFieldLabel(radio);
      return label.text || radio.value;
    }
    
    findFieldLabel(field) {
      // 1. Check aria-label
      const ariaLabel = field.getAttribute('aria-label');
      if (ariaLabel) return { text: this.cleanText(ariaLabel), type: 'aria' };
      
      // 2. Check for label with for attribute
      if (field.id) {
        const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
        if (label) return { text: this.cleanText(label.textContent), type: 'for' };
      }
      
      // 3. Check parent label
      const parentLabel = field.closest('label');
      if (parentLabel) {
        // Get text without the input element
        const clone = parentLabel.cloneNode(true);
        const inputs = clone.querySelectorAll('input, select, textarea');
        inputs.forEach(el => el.remove());
        return { text: this.cleanText(clone.textContent), type: 'parent' };
      }
      
      // 4. Look for adjacent text
      const adjacentLabel = this.findAdjacentLabel(field);
      if (adjacentLabel) return adjacentLabel;
      
      // 5. Use placeholder
      if (field.placeholder) {
        return { text: field.placeholder, type: 'placeholder' };
      }
      
      // 6. Use name as fallback
      if (field.name) {
        return { 
          text: field.name.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
          type: 'name' 
        };
      }
      
      return { text: 'Unlabeled field', type: 'none' };
    }
    
    findAdjacentLabel(field) {
      // Look for text immediately before the field
      const parent = field.parentElement;
      if (!parent) return null;
      
      // Check all child nodes of parent
      const nodes = Array.from(parent.childNodes);
      const fieldIndex = nodes.indexOf(field);
      
      // Look backwards for text
      for (let i = fieldIndex - 1; i >= 0; i--) {
        const node = nodes[i];
        
        if (node.nodeType === Node.TEXT_NODE) {
          const text = this.cleanText(node.textContent);
          if (text) return { text, type: 'adjacent' };
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const text = this.cleanText(node.textContent);
          if (text && !node.matches('input, select, textarea')) {
            return { text, type: 'adjacent' };
          }
        }
      }
      
      return null;
    }
    
    findPrecedingLabel(element, container) {
      // Find label-like element that precedes this element
      let current = element.previousElementSibling;
      
      while (current && container.contains(current)) {
        if (current.matches('label, .label, .form-label, span, div')) {
          const text = this.cleanText(current.textContent);
          if (text && text.length < 100) {
            return current;
          }
        }
        current = current.previousElementSibling;
      }
      
      // Also check parent's previous sibling
      if (element.parentElement !== container) {
        return this.findPrecedingLabel(element.parentElement, container);
      }
      
      return null;
    }
    
    findCommonParent(elements) {
      if (elements.length === 0) return null;
      
      let parent = elements[0].parentElement;
      
      while (parent) {
        if (elements.every(el => parent.contains(el))) {
          return parent;
        }
        parent = parent.parentElement;
      }
      
      return null;
    }
    
    classifyField(fieldInfo) {
      const labelText = (fieldInfo.label?.text || '').toLowerCase();
      const fieldName = (fieldInfo.name || '').toLowerCase();
      const fieldType = (fieldInfo.type || '').toLowerCase();
      const combined = `${labelText} ${fieldName}`.toLowerCase();
      
      // Business identification fields
      if (combined.match(/organization\s*type|entity\s*type|business\s*type|legal\s*structure|business\s*structure|incorporation/)) {
        return { category: 'entity_type', confidence: 95 };
      }
      
      if (combined.match(/organization\s*name|business\s*name|company\s*name|legal\s*name|entity\s*name|corporate\s*name/)) {
        return { category: 'business_name', confidence: 95 };
      }
      
      if (combined.match(/dba|doing\s*business|trade\s*name|fictitious/)) {
        return { category: 'dba', confidence: 90 };
      }
      
      // Tax/ID fields
      if (combined.match(/ein|employer\s*identification|federal\s*tax\s*id|fein/)) {
        return { category: 'ein', confidence: 95 };
      }
      
      if (combined.match(/state\s*tax\s*id|state\s*id\s*number|state\s*registration/)) {
        return { category: 'state_tax_id', confidence: 90 };
      }
      
      if (combined.match(/ssn|social\s*security/)) {
        return { category: 'ssn', confidence: 95 };
      }
      
      // Contact fields
      if (fieldType === 'email' || combined.match(/email|e-mail/)) {
        return { category: 'email', confidence: 95 };
      }
      
      if (fieldType === 'tel' || combined.match(/phone|telephone|mobile|cell/)) {
        return { category: 'phone', confidence: 90 };
      }
      
      if (combined.match(/fax/)) {
        return { category: 'fax', confidence: 90 };
      }
      
      // Address fields
      if (combined.match(/street|address\s*line\s*1|mailing\s*address|physical\s*address|business\s*address/)) {
        return { category: 'address', confidence: 90 };
      }
      
      if (combined.match(/address\s*(line\s*)?2|suite|apt|unit/)) {
        return { category: 'address2', confidence: 85 };
      }
      
      if (combined.match(/city|town|municipality/)) {
        return { category: 'city', confidence: 90 };
      }
      
      if (combined.match(/\bstate\b|province/) && !combined.includes('statement')) {
        return { category: 'state', confidence: 85 };
      }
      
      if (combined.match(/zip|postal\s*code/)) {
        return { category: 'zip', confidence: 90 };
      }
      
      if (combined.match(/county/)) {
        return { category: 'county', confidence: 85 };
      }
      
      // People fields
      if (combined.match(/owner|principal|proprietor|officer|director|member/)) {
        return { category: 'owner_info', confidence: 85 };
      }
      
      if (combined.match(/first\s*name/)) {
        return { category: 'first_name', confidence: 90 };
      }
      
      if (combined.match(/last\s*name/)) {
        return { category: 'last_name', confidence: 90 };
      }
      
      if (combined.match(/middle\s*(name|initial)/)) {
        return { category: 'middle_name', confidence: 85 };
      }
      
      // Business details
      if (combined.match(/naics|industry\s*code|business\s*code/)) {
        return { category: 'naics_code', confidence: 85 };
      }
      
      if (combined.match(/business\s*purpose|business\s*description|nature\s*of\s*business/)) {
        return { category: 'business_purpose', confidence: 85 };
      }
      
      if (combined.match(/employees|employee\s*count|number\s*of\s*employees/)) {
        return { category: 'employee_count', confidence: 85 };
      }
      
      // Date fields
      if (fieldType === 'date' || combined.match(/date|when|established/)) {
        return { category: 'date', confidence: 80 };
      }
      
      // Selection fields
      if (fieldType === 'select-one' || fieldType === 'radio_group') {
        if (fieldInfo.options && fieldInfo.options.length > 0) {
          // Try to classify based on options
          const optionTexts = fieldInfo.options.map(o => o.label || o.value).join(' ').toLowerCase();
          
          if (optionTexts.match(/llc|corporation|partnership|sole\s*proprietor/)) {
            return { category: 'entity_type', confidence: 90 };
          }
          
          if (optionTexts.match(/yes|no|true|false/)) {
            return { category: 'boolean', confidence: 85 };
          }
        }
        
        return { category: 'selection', confidence: 70 };
      }
      
      // Boolean fields
      if (fieldType === 'checkbox' && !combined.match(/agree|terms|conditions/)) {
        return { category: 'boolean', confidence: 75 };
      }
      
      // Agreement fields
      if (fieldType === 'checkbox' && combined.match(/agree|accept|terms|conditions|consent/)) {
        return { category: 'agreement', confidence: 85 };
      }
      
      // Default based on type
      if (fieldType === 'textarea') {
        return { category: 'text_area', confidence: 60 };
      }
      
      if (fieldType === 'number') {
        return { category: 'number', confidence: 60 };
      }
      
      // Generic text field
      if (fieldType === 'text' || fieldType === 'input') {
        return { category: 'text', confidence: 50 };
      }
      
      // Fallback
      return { category: 'other', confidence: 40 };
    }
    
    isVisible(element) {
      if (!element) return false;
      
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      
      return rect.width > 0 && 
             rect.height > 0 && 
             style.display !== 'none' && 
             style.visibility !== 'hidden' &&
             style.opacity !== '0';
    }
    
    getElementPosition(element) {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        bottom: rect.bottom + window.scrollY,
        right: rect.right + window.scrollX,
        width: rect.width,
        height: rect.height
      };
    }
    
    cleanText(text) {
      return text
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[*:]+$/, '')
        .trim();
    }
    
    getUIData() {
      // Organize fields by category for the panel
      const categories = {};
      
      this.detectedFields.forEach(field => {
        const cat = field.classification.category;
        if (!categories[cat]) {
          categories[cat] = {
            label: this.getCategoryLabel(cat),
            fields: []
          };
        }
        categories[cat].fields.push(field);
      });
      
      return {
        sections: this.sections,
        categories: categories,
        summary: {
          totalFields: this.detectedFields.length,
          sectionCount: this.sections.length,
          categoryCount: Object.keys(categories).length,
          confidence: this.calculateConfidence()
        }
      };
    }
    
    getCategoryLabel(category) {
      const labels = {
        'business_name': 'Business Name',
        'entity_type': 'Entity Type',
        'dba': 'DBA/Trade Name',
        'ein': 'EIN/Federal Tax ID',
        'state_tax_id': 'State Tax ID',
        'ssn': 'SSN',
        'email': 'Email',
        'phone': 'Phone',
        'fax': 'Fax',
        'address': 'Street Address',
        'address2': 'Address Line 2',
        'city': 'City',
        'state': 'State',
        'zip': 'ZIP Code',
        'county': 'County',
        'owner_info': 'Owner Information',
        'first_name': 'First Name',
        'last_name': 'Last Name',
        'middle_name': 'Middle Name',
        'naics_code': 'Industry Code',
        'business_purpose': 'Business Purpose',
        'employee_count': 'Number of Employees',
        'date': 'Date',
        'selection': 'Selection',
        'boolean': 'Yes/No',
        'agreement': 'Terms & Agreements',
        'text_area': 'Text Area',
        'number': 'Number',
        'text': 'Text Field',
        'other': 'Other'
      };
      
      return labels[category] || category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    
    calculateConfidence() {
      if (this.detectedFields.length === 0) return 0;
      
      // Higher confidence for business-specific fields
      const businessFields = ['business_name', 'entity_type', 'ein', 'dba', 'naics_code'];
      const businessFieldCount = this.detectedFields.filter(f => 
        businessFields.includes(f.classification.category)
      ).length;
      
      const avgConfidence = this.detectedFields.reduce((sum, field) => 
        sum + field.classification.confidence, 0
      ) / this.detectedFields.length;
      
      // Boost confidence if we have key business fields
      const boost = businessFieldCount > 0 ? 10 : 0;
      
      return Math.min(Math.round(avgConfidence + boost), 95);
    }
  }
  
  // ============= MESSAGING (SIMPLIFIED) =============
  class Messaging {
    constructor() {
      this.handlers = new Map();
      this.setupListener();
    }
    
    registerHandler(action, handler) {
      this.handlers.set(action, handler);
    }
    
    async sendMessage(message) {
      return new Promise((resolve) => {
        try {
          if (!chrome?.runtime?.sendMessage) {
            resolve({ success: false, error: 'No messaging available' });
            return;
          }
          
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[BRA] Message error:', chrome.runtime.lastError.message);
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(response || {});
            }
          });
        } catch (error) {
          resolve({ success: false, error: error.message });
        }
      });
    }
    
    setupListener() {
      if (!chrome?.runtime?.onMessage) return;
      
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message).then(response => {
          sendResponse(response || { received: true });
        });
        return true;
      });
    }
    
    async handleMessage(message) {
      const handler = this.handlers.get(message.action);
      if (handler) {
        try {
          return await handler(message);
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
      return { success: false, error: 'Unknown action' };
    }
  }
  
  // ============= URL DETECTOR =============
  const URLDetector = {
    analyzeUrl(url) {
      try {
        const urlString = url?.href || url?.toString() || '';
        const hostname = new URL(urlString).hostname.toLowerCase();
        
        const isGov = hostname.includes('.gov') || 
                     hostname.includes('.state.') ||
                     hostname.includes('.us');
        
        let state = null;
        if (hostname.includes('dc.gov')) state = 'DC';
        else if (hostname.includes('ca.gov')) state = 'CA';
        else if (hostname.includes('ny.gov')) state = 'NY';
        else if (hostname.includes('fl.gov')) state = 'FL';
        else if (hostname.includes('tx.gov')) state = 'TX';
        
        return {
          isGovernmentSite: isGov,
          score: isGov ? 80 : 20,
          state: state
        };
      } catch (e) {
        return { isGovernmentSite: false, score: 0, state: null };
      }
    }
  };
  
  // ============= MAIN LOGIC =============
  const messaging = new Messaging();
  const state = {
    detection: {
      isRunning: false,
      lastResult: null,
      debounceTimer: null
    }
  };
  
  // Register handlers
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
      message: 'No result available'
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
  
  function scheduleDetection() {
    if (state.detection.debounceTimer) {
      clearTimeout(state.detection.debounceTimer);
    }
    
    state.detection.debounceTimer = setTimeout(() => {
      runDetection();
    }, 500);
  }
  
  async function runDetection() {
    if (state.detection.isRunning) return;
    
    console.log('[BRA] Running smart detection');
    state.detection.isRunning = true;
    
    try {
      const result = {
        timestamp: Date.now(),
        url: window.location.href,
        isBusinessRegistrationForm: false,
        confidenceScore: 0
      };
      
      // URL detection
      result.urlDetection = URLDetector.analyzeUrl(window.location);
      
      // Field detection
      const detector = new SmartFieldDetector();
      const fields = await detector.detectFields();
      const uiData = detector.getUIData();
      
      result.fieldDetection = {
        isDetected: fields.length > 0,
        fields: fields,
        uiData: uiData,
        confidence: uiData.summary.confidence,
        state: result.urlDetection.state,
        classifiedFields: fields.length
      };
      
      // Calculate overall score
      const urlScore = result.urlDetection?.score || 0;
      const fieldConfidence = uiData.summary.confidence || 0;
      
      // Weight field detection more heavily
      result.confidenceScore = Math.round((urlScore * 0.3) + (fieldConfidence * 0.7));
      result.isBusinessRegistrationForm = result.confidenceScore > 40 && fields.length > 0;
      result.state = result.urlDetection.state;
      
      // Store result
      state.detection.lastResult = result;
      
      // Send to background
      await messaging.sendMessage({
        action: 'formDetected',
        result: result
      });
      
      console.log('[BRA] Smart detection complete:', {
        fields: fields.length,
        sections: uiData.sections.length,
        confidence: result.confidenceScore
      });
      
    } catch (error) {
      console.error('[BRA] Detection error:', error);
    } finally {
      state.detection.isRunning = false;
    }
  }
  
  // Initialize
  async function initialize() {
    console.log('[BRA] Initializing smart content script');
    
    await messaging.sendMessage({
      action: 'contentScriptReady',
      url: window.location.href
    });
    
    // Initial detection
    setTimeout(() => {
      scheduleDetection();
    }, 1000);
    
    // Set up mutation observer
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
    
    console.log('[BRA] Smart content script ready');
  }
  
  initialize();
  
})();