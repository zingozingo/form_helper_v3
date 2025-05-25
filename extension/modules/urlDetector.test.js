/**
 * Test utility for URL Detector Module
 * Run this in a browser environment or Node.js with ES module support
 */

import URLDetector from './urlDetector.js';

// Sample URLs to test
const TEST_URLS = [
  // High confidence examples (should score 80-100)
  {
    url: 'https://sos.ca.gov/business-programs/business-entities/',
    desc: 'CA Secretary of State Business Entities'
  },
  {
    url: 'https://www.dos.ny.gov/corporations/busforms.html',
    desc: 'NY Department of State Corporations Forms'
  },
  {
    url: 'https://bizfileonline.sos.ca.gov/registration',
    desc: 'CA SOS Bizfile Online Registration'
  },
  {
    url: 'https://business.ohio.gov/filing/',
    desc: 'Ohio Business Filings'
  },
  {
    url: 'https://corporations.pa.gov/search/corpsearch',
    desc: 'PA Corporations Search'
  },
  
  // Medium confidence examples (should score 60-79)
  {
    url: 'https://tax.ny.gov/bus/startup/',
    desc: 'NY Tax Business Startup'
  },
  {
    url: 'https://countyofriverside.us/business/forms/fictitious_business_name.html',
    desc: 'County Business Forms'
  },
  {
    url: 'https://www.cityofchicago.org/city/en/depts/bacp/supp_info/business_licenseforms.html',
    desc: 'City Business License Forms'
  },
  {
    url: 'https://cityofseattle.gov/licenses/new-business',
    desc: 'City New Business'
  },
  
  // Low confidence examples (should score 30-59)
  {
    url: 'https://dmv.ca.gov/business-partners',
    desc: 'CA DMV Business Partners'
  },
  {
    url: 'https://www.taxpayer.ny.gov/online',
    desc: 'NY Taxpayer Portal'
  },
  {
    url: 'https://www.state.nj.us/business-resources',
    desc: 'NJ Business Resources'
  },
  
  // Very low confidence/negative examples (should score 0-29)
  {
    url: 'https://ca.gov/residents/health',
    desc: 'CA.gov Health Section'
  },
  {
    url: 'https://www.weather.gov',
    desc: 'Weather.gov'
  },
  {
    url: 'https://www.google.com/search?q=how+to+register+business',
    desc: 'Google search for business registration'
  },
  {
    url: 'https://www.example.com/product/registration',
    desc: 'Product Registration Non-Government'
  },
  {
    url: 'https://business-insider.com',
    desc: 'Business News Site'
  }
];

// Run tests
async function runTests() {
  console.log('=== URL DETECTOR TEST RESULTS ===\n');
  
  // Initialize URL detector
  await URLDetector.initialize();
  
  const results = await Promise.all(TEST_URLS.map(async test => {
    const analysis = await URLDetector.analyzeUrl(test.url);
    const stateCode = URLDetector.identifyStateFromUrl(test.url);
    
    return {
      description: test.desc,
      url: test.url,
      score: analysis.score,
      isBusinessRegistration: analysis.isLikelyRegistrationSite,
      stateIdentified: stateCode,
      confidentCategory: getConfidenceCategory(analysis.score),
      reasons: analysis.reasons
    };
  }));
  
  // Display results in confidence categories
  const confidenceGroups = {
    'High Confidence (80-100)': [],
    'Medium Confidence (60-79)': [],
    'Low Confidence (30-59)': [],
    'Very Low Confidence (0-29)': []
  };
  
  results.forEach(result => {
    confidenceGroups[result.confidentCategory].push(result);
  });
  
  // Print report
  Object.keys(confidenceGroups).forEach(category => {
    console.log(`\n${category}:`);
    console.log('='.repeat(category.length + 1));
    
    if (confidenceGroups[category].length === 0) {
      console.log('No URLs in this category');
    } else {
      confidenceGroups[category].forEach(result => {
        console.log(`\n${result.description} (${result.score}%):`);
        console.log(`URL: ${result.url}`);
        console.log(`Is Business Registration: ${result.isBusinessRegistration}`);
        console.log(`State Identified: ${result.stateIdentified || 'None'}`);
        console.log('Reasons:');
        result.reasons.forEach(reason => console.log(`- ${reason}`));
      });
    }
  });
  
  // Print summary
  console.log('\n\n=== TEST SUMMARY ===');
  console.log(`Total URLs Tested: ${results.length}`);
  console.log(`High Confidence: ${confidenceGroups['High Confidence (80-100)'].length}`);
  console.log(`Medium Confidence: ${confidenceGroups['Medium Confidence (60-79)'].length}`);
  console.log(`Low Confidence: ${confidenceGroups['Low Confidence (30-59)'].length}`);
  console.log(`Very Low Confidence: ${confidenceGroups['Very Low Confidence (0-29)'].length}`);
  
  // Test accuracy
  const correctDetections = results.filter(result => {
    // URLs that should be detected (first 9 in our test array)
    const shouldBeDetected = TEST_URLS.indexOf(TEST_URLS.find(t => t.url === result.url)) < 9;
    return (shouldBeDetected && result.isBusinessRegistration) || 
           (!shouldBeDetected && !result.isBusinessRegistration);
  });
  
  const accuracy = (correctDetections.length / results.length) * 100;
  console.log(`\nAccuracy: ${accuracy.toFixed(2)}%`);
}

// Helper function to categorize confidence scores
function getConfidenceCategory(score) {
  if (score >= 80) return 'High Confidence (80-100)';
  if (score >= 60) return 'Medium Confidence (60-79)';
  if (score >= 30) return 'Low Confidence (30-59)';
  return 'Very Low Confidence (0-29)';
}

// Run tests if in a non-module environment
if (typeof window !== 'undefined') {
  window.onload = runTests;
} else {
  runTests();
}

// Export for test harness
export { runTests, TEST_URLS };