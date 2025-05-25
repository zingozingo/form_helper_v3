# Migration Guide: Hybrid State Knowledge System

## Overview

The Business Registration Assistant uses a hybrid approach for state knowledge:
- **California & Delaware**: Hardcoded with comprehensive form mappings
- **Other States**: Template-based system allowing rapid expansion

This guide covers migrating to and expanding the hybrid system.

## Step-by-Step Guide for Adding New States

### 1. Create State JSON File

Create a new file in `knowledge/states/{state}.json`:

```json
{
  "state": "State Name",
  "abbreviation": "XX",
  "entity_types": {
    "llc": {
      "name": "Limited Liability Company",
      "form_number": "FORM-123",
      "fee": "$100",
      "processing_time": "5-7 business days"
    }
  },
  "urls": {
    "main": "https://state.gov/business",
    "search": "https://state.gov/search",
    "forms": "https://state.gov/forms"
  },
  "filing_methods": ["online", "mail"],
  "expedited_available": true,
  "notes": "Special requirements or notes"
}
```

### 2. Add State to URL Detector

Update `extension/modules/urlDetector.js`:

```javascript
// Add to STATE_PATTERNS
'state.gov': 'state_name',
'stateabbr.gov': 'state_name'
```

### 3. Test Implementation

```bash
# Run URL detection tests
npm test -- urlDetector.test.js

# Test in browser
1. Load extension
2. Navigate to state website
3. Verify detection and form filling
```

### 4. Submit PR

Include:
- State JSON file
- URL pattern updates
- Test results
- Screenshots of working implementation

## DC Implementation Lessons Learned

### What Worked Well
1. **Quick Setup**: Template system allowed DC addition in ~30 minutes
2. **Consistent Structure**: Standardized JSON format made implementation straightforward
3. **Flexible Fields**: Optional fields accommodated state-specific requirements

### Challenges & Solutions
1. **URL Detection**: Some states use multiple domains
   - Solution: Support multiple patterns per state
   
2. **Form Variations**: States may have different forms for same entity type
   - Solution: Support multiple form numbers in array

3. **Dynamic Content**: Some state sites load forms via JavaScript
   - Solution: Add delay/retry logic for form detection

### Best Practices
- Start with basic information, enhance iteratively
- Test on actual state websites
- Document state-specific quirks in notes field
- Include expedited options when available

## State Expansion Roadmap

### Phase 1: High-Priority States (Q1 2025)
- [x] California (complete)
- [x] Delaware (complete)
- [x] DC (template system proven)
- [ ] New York
- [ ] Texas
- [ ] Florida

### Phase 2: Business Hubs (Q2 2025)
- [ ] Nevada
- [ ] Wyoming
- [ ] Illinois
- [ ] Georgia
- [ ] North Carolina

### Phase 3: Remaining States (Q3-Q4 2025)
- Grouped by region for efficient testing
- Community contributions encouraged

## Community Contribution Guidelines

### How to Contribute

1. **Choose a State**: Check roadmap and existing PRs
2. **Research Requirements**: Gather state-specific information
3. **Create JSON File**: Follow template structure
4. **Test Thoroughly**: Verify on actual state website
5. **Submit PR**: Include all required elements

### Quality Standards

- **Accuracy**: All fees and requirements must be current
- **Completeness**: Include all common entity types
- **Testing**: Must work on actual state website
- **Documentation**: Clear notes for state-specific requirements

### Review Process

1. Automated tests must pass
2. Manual verification by maintainer
3. Community testing period (48 hours)
4. Merge upon approval

### Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Credited in release notes
- Eligible for "State Champion" badge

## Migration Timeline

### Immediate (Now)
- DC implementation complete
- Template system operational
- Documentation published

### Short Term (1-2 weeks)
- Community feedback incorporated
- First community contributions
- Template improvements based on usage

### Medium Term (1-3 months)
- 10+ states implemented
- Pattern library established
- Automated testing expanded

### Long Term (6-12 months)
- All 50 states + DC covered
- International expansion considered
- API integration explored

## Technical Considerations

### Performance
- JSON files are lightweight (~2KB each)
- Lazy loading prevents initial overhead
- Caching reduces repeated fetches

### Maintenance
- State data versioned in git
- Change tracking via commits
- Annual review process planned

### Extensibility
- Template supports custom fields
- Plugin architecture for complex states
- API-ready structure for future integration