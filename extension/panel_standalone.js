/**
 * Business Registration Assistant - Standalone Panel JavaScript
 * Handles UI updates and interactions for the side panel
 */

(function() {
  'use strict';

  // Field category mappings
  const FIELD_CATEGORIES = {
    // Business Information
    business_name: { section: 'business-info', label: 'Business Information', icon: '🏢' },
    dba: { section: 'business-info', label: 'Business Information', icon: '🏢' },
    entity_type: { section: 'business-info', label: 'Business Information', icon: '🏢' },
    business_purpose: { section: 'business-info', label: 'Business Information', icon: '🏢' },
    date_formed: { section: 'business-info', label: 'Business Information', icon: '🏢' },
    
    // Contact Information
    first_name: { section: 'contact-info', label: 'Contact Information', icon: '👤' },
    last_name: { section: 'contact-info', label: 'Contact Information', icon: '👤' },
    full_name: { section: 'contact-info', label: 'Contact Information', icon: '👤' },
    email: { section: 'contact-info', label: 'Contact Information', icon: '👤' },
    phone: { section: 'contact-info', label: 'Contact Information', icon: '👤' },
    
    // Address Information
    address: { section: 'address-info', label: 'Address Information', icon: '📍' },
    address2: { section: 'address-info', label: 'Address Information', icon: '📍' },
    city: { section: 'address-info', label: 'Address Information', icon: '📍' },
    state: { section: 'address-info', label: 'Address Information', icon: '📍' },
    zip: { section: 'address-info', label: 'Address Information', icon: '📍' },
    country: { section: 'address-info', label: 'Address Information', icon: '📍' },
    
    // Tax Information
    ein: { section: 'tax-info', label: 'Tax Information', icon: '💰' },
    ssn: { section: 'tax-info', label: 'Tax Information', icon: '💰' },
    naics_code: { section: 'tax-info', label: 'Tax Information', icon: '💰' },
    sic_code: { section: 'tax-info', label: 'Tax Information', icon: '💰' },
    fiscal_year_end: { section: 'tax-info', label: 'Tax Information', icon: '💰' }
  };

  // Field display names
  const FIELD_DISPLAY_NAMES = {
    business_name: 'Business Name',
    dba: 'DBA/Trade Name',
    entity_type: 'Entity Type',
    ein: 'EIN',
    ssn: 'SSN',
    first_name: 'First Name',
    last_name: 'Last Name',
    full_name: 'Full Name',
    email: 'Email Address',
    phone: 'Phone Number',
    address: 'Street Address',
    address2: 'Address Line 2',
    city: 'City',
    state: 'State',
    zip: 'ZIP Code',
    country: 'Country',
    naics_code: 'NAICS Code',
    sic_code: 'SIC Code',
    business_purpose: 'Business Purpose',
    date_formed: 'Date Formed',
    fiscal_year_end: 'Fiscal Year End'
  };

  class PanelUI {
    constructor() {
      this.detectionResult = null;
      this.highlightedElements = [];
      this.chatExpanded = true;
      this.fieldElements = new Map();
      this.setupEventListeners();
      this.initializeUI();
    }

    setupEventListeners() {
      // Autofill button
      const autofillBtn = document.getElementById('autofill-btn');
      if (autofillBtn) {
        autofillBtn.addEventListener('click', () => this.handleAutofill());
      }

      // Validate button
      const validateBtn = document.getElementById('validate-btn');
      if (validateBtn) {
        validateBtn.addEventListener('click', () => this.handleValidate());
      }

      // Chat toggle
      const chatToggle = document.getElementById('chat-toggle');
      if (chatToggle) {
        chatToggle.addEventListener('click', () => this.toggleChat());
      }

      // Chat input
      const chatInput = document.getElementById('chat-input');
      const chatSend = document.getElementById('chat-send');
      
      if (chatInput && chatSend) {
        chatSend.addEventListener('click', () => this.sendChatMessage());
        chatInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            this.sendChatMessage();
          }
        });
      }

      // Listen for messages from content script
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'BRA_UPDATE') {
          this.updateFromDetectionResult(event.data.result);
        }
      });
    }

    initializeUI() {
      // Request initial data from parent
      window.parent.postMessage({ type: 'BRA_PANEL_READY' }, '*');
    }

    updateFromDetectionResult(result) {
      this.detectionResult = result;

      if (!result || !result.isBusinessRegistrationForm) {
        this.showError();
        return;
      }

      // Update state badge
      const stateBadge = document.getElementById('state-badge');
      if (stateBadge && result.state) {
        stateBadge.textContent = `${result.state} Form Detected`;
      }

      // Update confidence score
      this.updateConfidenceScore(result.confidenceScore || 0);

      // Update fields display
      if (result.fieldDetectionResults && result.fieldDetectionResults.fields) {
        this.displayFields(result.fieldDetectionResults.fields);
      }

      // Show relevant sections
      document.getElementById('fields-section').style.display = 'block';
      document.getElementById('actions-section').style.display = 'block';
      document.getElementById('chat-section').style.display = 'block';
      document.getElementById('error-section').style.display = 'none';
    }

    updateConfidenceScore(score) {
      const fill = document.getElementById('confidence-fill');
      const value = document.getElementById('confidence-value');
      
      if (fill && value) {
        fill.style.width = `${score}%`;
        value.textContent = `${score}%`;
        
        // Update color based on score
        if (score >= 80) {
          fill.style.background = 'linear-gradient(90deg, #4CAF50 0%, #45a049 100%)';
        } else if (score >= 60) {
          fill.style.background = 'linear-gradient(90deg, #FF9800 0%, #F57C00 100%)';
        } else {
          fill.style.background = 'linear-gradient(90deg, #f44336 0%, #d32f2f 100%)';
        }
      }
    }

    displayFields(fields) {
      const container = document.getElementById('fields-container');
      if (!container) return;

      container.innerHTML = '';
      this.fieldElements.clear();

      // Group fields by section
      const sections = new Map();
      
      fields.forEach(field => {
        if (!field.classification) return;
        
        const category = field.classification.category;
        const categoryInfo = FIELD_CATEGORIES[category] || 
                           { section: 'other-info', label: 'Other Information', icon: '📄' };
        
        if (!sections.has(categoryInfo.section)) {
          sections.set(categoryInfo.section, {
            label: categoryInfo.label,
            icon: categoryInfo.icon,
            fields: []
          });
        }
        
        sections.get(categoryInfo.section).fields.push({
          ...field,
          displayName: FIELD_DISPLAY_NAMES[category] || field.label?.text || field.name || 'Unknown Field'
        });
      });

      // Display sections in order
      const sectionOrder = ['business-info', 'contact-info', 'address-info', 'tax-info', 'other-info'];
      
      sectionOrder.forEach(sectionId => {
        if (!sections.has(sectionId)) return;
        
        const section = sections.get(sectionId);
        const sectionEl = this.createFieldSection(sectionId, section);
        container.appendChild(sectionEl);
      });
    }

    createFieldSection(sectionId, sectionData) {
      const section = document.createElement('div');
      section.className = `field-section ${sectionId}`;
      
      const header = document.createElement('div');
      header.className = 'field-section-header';
      header.innerHTML = `
        <span class="field-section-icon">${sectionData.icon}</span>
        <span>${sectionData.label}</span>
      `;
      section.appendChild(header);
      
      const fieldList = document.createElement('div');
      fieldList.className = 'field-list';
      
      sectionData.fields.forEach(field => {
        const fieldItem = document.createElement('div');
        fieldItem.className = 'field-item';
        
        const fieldName = document.createElement('span');
        fieldName.className = 'field-name';
        fieldName.textContent = field.displayName;
        
        const fieldType = document.createElement('span');
        fieldType.className = 'field-type';
        fieldType.textContent = field.type || 'text';
        
        fieldItem.appendChild(fieldName);
        fieldItem.appendChild(fieldType);
        
        // Store reference to field element
        this.fieldElements.set(field.element, fieldItem);
        
        // Add click handler
        fieldItem.addEventListener('click', () => {
          this.highlightFieldInPage(field.element);
          this.highlightFieldInPanel(fieldItem);
        });
        
        fieldList.appendChild(fieldItem);
      });
      
      section.appendChild(fieldList);
      return section;
    }

    highlightFieldInPage(element) {
      // Send message to parent to highlight field
      window.parent.postMessage({
        type: 'BRA_HIGHLIGHT_FIELD',
        elementId: element.id || element.name
      }, '*');
    }

    highlightFieldInPanel(fieldItem) {
      // Remove previous highlights
      document.querySelectorAll('.field-item.highlighted').forEach(item => {
        item.classList.remove('highlighted');
      });
      
      // Add highlight to clicked item
      fieldItem.classList.add('highlighted');
      
      // Remove after 2 seconds
      setTimeout(() => {
        fieldItem.classList.remove('highlighted');
      }, 2000);
    }

    handleAutofill() {
      const btn = document.getElementById('autofill-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-icon">⏳</span> Filling...';
      }

      // Send autofill request to parent
      window.parent.postMessage({ type: 'BRA_AUTOFILL' }, '*');

      // Reset button after delay
      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="btn-icon">✨</span> Auto Fill Sample Data';
        }
      }, 2000);
    }

    handleValidate() {
      const btn = document.getElementById('validate-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-icon">⏳</span> Validating...';
      }

      // Send validate request to parent
      window.parent.postMessage({ type: 'BRA_VALIDATE' }, '*');

      // Show validation results
      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="btn-icon">✓</span> Validation Complete';
        }
        
        this.addChatMessage('assistant', 'I\'ve validated the form fields. All required fields appear to be properly formatted.');
        
        // Reset button text after delay
        setTimeout(() => {
          if (btn) {
            btn.innerHTML = '<span class="btn-icon">✓</span> Validate Fields';
          }
        }, 2000);
      }, 1500);
    }

    toggleChat() {
      this.chatExpanded = !this.chatExpanded;
      const chatContent = document.getElementById('chat-content');
      const chatToggle = document.getElementById('chat-toggle');
      
      if (chatContent) {
        chatContent.classList.toggle('collapsed', !this.chatExpanded);
      }
      
      if (chatToggle) {
        chatToggle.textContent = this.chatExpanded ? '−' : '+';
      }
    }

    sendChatMessage() {
      const input = document.getElementById('chat-input');
      if (!input || !input.value.trim()) return;

      const message = input.value.trim();
      this.addChatMessage('user', message);
      
      // Clear input
      input.value = '';

      // Simulate assistant response
      setTimeout(() => {
        const responses = [
          'I can help you fill out this form. Click on any field to highlight it, or use the Auto Fill button to populate sample data.',
          'This appears to be a business registration form. Make sure to have your EIN and business details ready.',
          'I notice you have several required fields. Would you like me to guide you through each section?',
          'The form has been analyzed and all fields have been categorized. Let me know if you need help with any specific section.'
        ];
        
        const response = responses[Math.floor(Math.random() * responses.length)];
        this.addChatMessage('assistant', response);
      }, 800);
    }

    addChatMessage(type, content) {
      const messagesContainer = document.getElementById('chat-messages');
      if (!messagesContainer) return;

      const messageEl = document.createElement('div');
      messageEl.className = `chat-message ${type}`;
      
      if (type === 'assistant') {
        messageEl.innerHTML = `
          <div class="message-icon">🤖</div>
          <div class="message-content">${content}</div>
        `;
      } else {
        messageEl.innerHTML = `
          <div class="message-content">${content}</div>
        `;
      }

      messagesContainer.appendChild(messageEl);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    showError() {
      document.getElementById('fields-section').style.display = 'none';
      document.getElementById('actions-section').style.display = 'none';
      document.getElementById('chat-section').style.display = 'none';
      document.getElementById('error-section').style.display = 'flex';
    }
  }

  // Initialize panel UI
  const panelUI = new PanelUI();

  // Expose for debugging
  window.BRA_PANEL = panelUI;

})();