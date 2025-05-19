/**
 * Business Registration Assistant - Panel Script
 * Implementation for sidebar panel UI with chat functionality
 */

// DOM elements - Detection
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const noDetectionView = document.getElementById('no-detection');
const detectionView = document.getElementById('detection');
const stateValue = document.getElementById('state-value');
const confidenceBar = document.getElementById('confidence-bar');
const confidenceValue = document.getElementById('confidence-value');
const checkAgainButton = document.getElementById('check-again');

// DOM elements - Chat
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

// Initialize when panel opens
document.addEventListener('DOMContentLoaded', function() {
  console.log('[BRA] Panel opened');
  
  // Get current tab
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs && tabs[0]) {
      // Get detection for current tab
      getDetectionResult(tabs[0].id);
    }
  });
  
  // Set up Check Again button
  checkAgainButton.addEventListener('click', function() {
    statusText.textContent = 'Checking...';
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs[0]) {
        // Ask content script to run detection
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'triggerDetection'
        }, function() {
          // Wait a moment for detection to finish
          setTimeout(function() {
            getDetectionResult(tabs[0].id);
          }, 500);
        });
      }
    });
  });
  
  // Set up chat form submission
  chatForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const message = chatInput.value.trim();
    if (!message) return;
    
    // Add user message to chat
    addChatMessage(message, 'user');
    
    // Clear input
    chatInput.value = '';
    
    // Process the message and respond
    processUserMessage(message);
  });
});

// Get detection result from background script
function getDetectionResult(tabId) {
  chrome.runtime.sendMessage({
    action: 'getDetectionResult',
    tabId: tabId
  }, function(response) {
    if (response && response.success && response.result) {
      // Show detection result
      updateUI(response.result);
    } else {
      // Try asking content script directly
      askContentScript(tabId);
    }
  });
}

// Ask content script for results if background doesn't have them
function askContentScript(tabId) {
  chrome.tabs.sendMessage(tabId, {
    action: 'getDetectionResult'
  }, function(result) {
    if (chrome.runtime.lastError) {
      // Content script not available
      showNoDetection();
      return;
    }
    
    if (result) {
      updateUI(result);
    } else {
      showNoDetection();
    }
  });
}

// Update UI with detection result
function updateUI(result) {
  if (!result || !result.isBusinessRegistrationForm) {
    showNoDetection();
    return;
  }
  
  // Show detection view
  noDetectionView.classList.add('hidden');
  detectionView.classList.remove('hidden');
  
  // Update status indicator
  statusIndicator.classList.add('active');
  statusText.textContent = 'Business form detected';
  
  // Update state
  stateValue.textContent = result.state ? getStateName(result.state) : 'Unknown';
  
  // Update confidence
  const confidence = result.confidenceScore;
  confidenceBar.style.width = Math.min(confidence, 100) + '%';
  confidenceValue.textContent = confidence + '%';
}

// Show no detection view
function showNoDetection() {
  statusIndicator.classList.remove('active');
  statusText.textContent = 'No detection';
  
  noDetectionView.classList.remove('hidden');
  detectionView.classList.add('hidden');
}

// Get full state name
function getStateName(code) {
  const states = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
    'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
    'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
    'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
  };
  
  return states[code] || code;
}

// Chat Functions

// Add a message to the chat
function addChatMessage(text, type) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', type);
  messageDiv.textContent = text;
  
  chatMessages.appendChild(messageDiv);
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Process user message and generate response
function processUserMessage(message) {
  // Simple response logic for now
  setTimeout(() => {
    let response;
    
    // Basic keyword matching
    if (message.toLowerCase().includes('help')) {
      response = "I can help you with business registration questions. What specifically would you like to know?";
    } 
    else if (message.toLowerCase().includes('llc')) {
      response = "An LLC (Limited Liability Company) is a business structure that combines pass-through taxation with limited liability protection.";
    }
    else if (message.toLowerCase().includes('corporation')) {
      response = "A corporation is a legal entity that is separate and distinct from its owners, offering limited liability protection but with more complex taxation.";
    }
    else if (message.toLowerCase().includes('cost') || message.toLowerCase().includes('fee')) {
      response = "Registration fees vary by state and business type. The base filing fee can range from $40 to $500, with additional fees for expedited processing.";
    }
    else if (message.toLowerCase().includes('time') || message.toLowerCase().includes('long')) {
      response = "Processing times vary by state. Standard processing typically takes 5-10 business days, while expedited options may be available for an additional fee.";
    }
    else {
      response = "I'm a simple assistant at the moment. Try asking about LLCs, corporations, registration fees, or processing times.";
    }
    
    addChatMessage(response, 'system');
  }, 600);
}