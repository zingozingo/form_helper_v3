/**
 * Business Registration Assistant - Minimal Popup Script
 * Works with self-sufficient content script
 */

async function checkCurrentTab() {
  const statusEl = document.getElementById('status');
  const recheckBtn = document.getElementById('recheck');
  
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      statusEl.className = 'status error';
      statusEl.textContent = 'No active tab';
      return;
    }
    
    // Check if URL matches our patterns
    const url = tab.url || '';
    const isGovSite = url.includes('.gov');
    
    if (!isGovSite) {
      statusEl.className = 'status not-detected';
      statusEl.textContent = 'Not a government website';
      recheckBtn.style.display = 'none';
      return;
    }
    
    // Try to get detection result from content script
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { 
        action: 'getDetectionResult' 
      });
      
      if (response && response.isBusinessRegistrationForm) {
        statusEl.className = 'status detected';
        statusEl.textContent = `Business form detected! (${response.confidenceScore}% confidence)`;
      } else {
        statusEl.className = 'status not-detected';
        statusEl.textContent = 'Not a business registration form';
      }
      
      recheckBtn.style.display = 'block';
      
    } catch (error) {
      // Content script might not be injected yet
      statusEl.className = 'status error';
      statusEl.textContent = 'Page analysis not available. Try refreshing the page.';
      recheckBtn.style.display = 'none';
    }
    
  } catch (error) {
    console.error('[BRA Popup] Error:', error);
    statusEl.className = 'status error';
    statusEl.textContent = 'Error checking page';
  }
}

// Re-check button handler
document.getElementById('recheck').addEventListener('click', async () => {
  const statusEl = document.getElementById('status');
  const recheckBtn = document.getElementById('recheck');
  
  // Show checking status
  statusEl.className = 'status checking';
  statusEl.textContent = 'Re-checking page...';
  recheckBtn.disabled = true;
  
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab) {
      // Trigger re-detection
      const response = await chrome.tabs.sendMessage(tab.id, { 
        action: 'triggerDetection' 
      });
      
      // Wait a bit for detection to complete
      setTimeout(() => {
        checkCurrentTab();
        recheckBtn.disabled = false;
      }, 1000);
    }
  } catch (error) {
    console.error('[BRA Popup] Re-check error:', error);
    recheckBtn.disabled = false;
    checkCurrentTab();
  }
});

// Check on popup open
checkCurrentTab();