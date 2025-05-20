# Field Classification System

The Field Classification System is a core component of the Business Registration Assistant that identifies and categorizes form fields based on their purpose in business registration forms. This document explains how the system works and how to interpret its results.

## Overview

The field classification system:

1. Detects form fields in business registration websites
2. Analyzes field attributes (name, id, label, etc.)
3. Classifies fields into business registration categories
4. Identifies relationships between related fields
5. Assigns confidence scores to classifications

## Field Categories

The system recognizes the following business registration field categories:

| Category | Description | Examples |
|----------|-------------|----------|
| businessName | Company/entity name fields | Business name, company name, legal name |
| businessId | Business identifier fields | Business ID, entity number, registration ID |
| taxId | Tax identification fields | EIN, FEIN, tax ID number, taxpayer ID |
| entityType | Business structure selection | LLC, corporation, partnership selection fields |
| businessAddress | Address information fields | Principal address, mailing address, registered office |
| contactInfo | Business contact information | Phone, email, website fields |
| personInfo | Owner/agent information | Name, title, contact info of business representatives |
| dateFields | Date-related information | Formation date, filing date, effective date |
| paymentInfo | Payment-related fields | Credit card, payment method, fee amount |
| filingDetails | Filing type information | Form type, document type, service type |
| authorization | Signature/consent fields | Electronic signature, certifications, agreements |

## Classification Confidence

Each classified field is assigned a confidence score (0-100%) indicating how strongly it matches a particular category:

- **High confidence (70-100%)**: Strong indicators of the field's purpose
- **Medium confidence (50-69%)**: Good indicators but some ambiguity
- **Low confidence (20-49%)**: Possible match but uncertain
- **Unclassified (<20%)**: Insufficient indicators to classify

## Field Relationships

The system identifies relationships between fields that form logical groups:

- **address_group**: Related fields that form a complete address (street, city, state, zip)
- **name_group**: Fields that form a person's name (first name, last name)
- **payment_group**: Credit card number, expiration, CVV fields
- **proximity_group**: Fields physically located near each other on the form

Field relationships increase classification confidence and enhance visual debugging.

## Using the Classification System

### Programmatic Access

```javascript
// Get all fields of a specific category with minimum confidence
const businessNames = detector.getFieldsByCategory('businessName', 70);

// Find the best field for a category
const primaryBusinessName = detector.findBestFieldForCategory('businessName');

// Get classification summary
const summary = detector.getClassificationSummary();

// Export detailed detection data
const exportData = detector.exportDetectionData();
```

### Visual Debugging

The field classification system includes visual debugging tools:

```javascript
// Highlight all fields with classifications
detector.highlightFields();

// Highlight with relationship lines
detector.highlightFields(false, {
  showLabels: true,
  showRelationships: true,
  duration: 15000
});
```

This creates:
- Color-coded borders around fields based on their classifications
- Labels showing field details and confidence levels
- Lines connecting related fields (when showRelationships is true)

### Classification Details

The `classification` property on field objects contains:

```javascript
field.classification = {
  category: 'businessName',       // Category name
  confidence: 85,                 // Confidence score (0-100)
  relationships: ['name_group'],  // Relationships with other fields
  matches: {                      // Match details
    nameMatch: '/business[-_]?name/i',
    labelMatch: '/business\\s*name\\b/i'
  }
};
```

## Integration with Form Detection

The field classification system enhances form detection:

1. Field classifications increase the confidence score for business registration form detection
2. Field relationships further increase confidence when related fields are detected
3. Classification results help identify the specific type of business registration form

## Performance Considerations

- Classification is performed on demand, not automatically for all pages
- Relationship detection adds minimal overhead to classification
- Visual debugging should be used only during development/testing