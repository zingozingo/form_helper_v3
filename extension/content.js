// Business Registration Assistant - Content Script
// Minimal implementation that only does detection

// Run detection when page is loaded
window.addEventListener('DOMContentLoaded', function() {
  console.log('BRA: Content script loaded');
  
  // Wait for page to fully load
  setTimeout(detectForm, 1000);
});

// Simple form detection function
function detectForm() {
  console.log('BRA: Running form detection');
  
  // Get page content
  const url = window.location.href.toLowerCase();
  const pageText = document.body.textContent.toLowerCase();
  
  // Basic detection - check for keywords
  let score = 0;
  
  // Check URL for government domains
  if (url.includes('.gov')) {
    console.log('BRA: Found .gov domain');
    score += 20;
  }
  
  // Check for business registration keywords
  const keywords = [
    'business registration', 'register a business',
    'llc', 'limited liability company',
    'corporation', 'incorporate',
    'articles of organization', 'business license'
  ];
  
  for (const keyword of keywords) {
    if (pageText.includes(keyword)) {
      console.log('BRA: Keyword match: ' + keyword);
      score += 10;
    }
  }
  
  // Check for forms on the page
  const forms = document.querySelectorAll('form');
  if (forms.length > 0) {
    console.log('BRA: Found form elements');
    score += 10;
  }
  
  // Threshold for detection
  const isBusinessForm = score >= 30;
  
  // Simple state detection
  let state = null;
  if (url.includes('.ca.gov') || pageText.includes('california')) state = 'CA';
  if (url.includes('.ny.gov') || pageText.includes('new york')) state = 'NY';
  if (url.includes('.tx.gov') || pageText.includes('texas')) state = 'TX';
  if (url.includes('.fl.gov') || pageText.includes('florida')) state = 'FL';
  if (url.includes('.dc.gov') || pageText.includes('district of columbia')) state = 'DC';
  
  // Create detection result
  const result = {
    isBusinessForm: isBusinessForm,
    confidence: score,
    state: state,
    url: window.location.href
  };
  
  console.log('BRA: Detection result', result);
  
  // Send result to background script
  chrome.runtime.sendMessage({
    action: 'detectionResult',
    result: result
  });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'getDetection') {
    // Run detection again and send result
    detectForm();
    sendResponse({success: true});
  }
  
  return true; // Keep message channel open
});