/**
 * Business Registration Assistant - Chat Script
 * Implements the chat interface functionality
 */

// DOM elements - Chat
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const chatSubmit = document.getElementById('chat-submit');

/**
 * Initialize chat functionality
 */
function initializeChat() {
  // Handle chat form submission
  chatForm.addEventListener('submit', function(e) {
    e.preventDefault();
    sendChatMessage();
  });
  
  // Handle Enter key press in chat input
  chatInput.addEventListener('keydown', function(e) {
    // Remove error styling when user starts typing
    chatInput.classList.remove('error');
    
    // Check for Enter key, but not with shift key
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent default to avoid form submission
      sendChatMessage();
    }
  });
}

/**
 * Send a chat message and handle UI updates
 */
function sendChatMessage() {
  const message = chatInput.value.trim();
  
  // Error handling for empty messages
  if (!message) {
    chatInput.classList.add('error');
    // Slightly shake the input to show it's required
    setTimeout(() => chatInput.classList.remove('error'), 500);
    return;
  }
  
  // Disable input and button during sending
  chatInput.disabled = true;
  chatSubmit.classList.add('sending');
  chatSubmit.disabled = true;
  
  // Add user message to chat
  addChatMessage(message, 'user');
  
  // Clear input
  chatInput.value = '';
  
  // Process the message and respond (with visual feedback)
  processUserMessage(message, function() {
    // Re-enable input and button after response
    chatInput.disabled = false;
    chatSubmit.classList.remove('sending');
    chatSubmit.disabled = false;
    chatInput.focus(); // Return focus to input for continued conversation
  });
}

/**
 * Add a message to the chat window
 * @param {string} text - Message text content
 * @param {string} type - Message type ('user' or 'system')
 */
function addChatMessage(text, type) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', type);
  messageDiv.textContent = text;
  
  chatMessages.appendChild(messageDiv);
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Process user message and generate response
 * @param {string} message - The user's message
 * @param {Function} callback - Function to call after processing
 */
function processUserMessage(message, callback) {
  // Simulate processing delay for better UX
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
    else if (message.toLowerCase().includes('thank')) {
      response = "You're welcome! Feel free to ask if you have any other questions about business registration.";
    }
    else {
      response = "I'm a simple assistant at the moment. Try asking about LLCs, corporations, registration fees, or processing times.";
    }
    
    // Add the response message to the chat
    addChatMessage(response, 'system');
    
    // If there's a callback function, execute it after response is shown
    if (typeof callback === 'function') {
      callback();
    }
  }, 800); // Slightly longer delay for more realistic assistant response time
}

// Initialize chat when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  initializeChat();
});