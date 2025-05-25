#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

class StateTemplateGenerator {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async prompt(question, defaultValue = '') {
        return new Promise((resolve) => {
            const q = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
            this.rl.question(q, (answer) => {
                resolve(answer || defaultValue);
            });
        });
    }

    async generateTemplate() {
        console.log('🚀 State Configuration Template Generator');
        console.log('========================================\n');

        try {
            // Collect basic information
            const stateName = await this.prompt('State name (e.g., "Texas")');
            const abbreviation = await this.prompt('State abbreviation (e.g., "TX")');
            const sosUrl = await this.prompt('Secretary of State URL', `https://www.sos.${stateName.toLowerCase()}.gov`);
            
            console.log('\nEntity Types Configuration:');
            const includeLLC = await this.prompt('Include LLC configuration? (y/n)', 'y') === 'y';
            const includeCorp = await this.prompt('Include Corporation configuration? (y/n)', 'y') === 'y';
            const includeNonProfit = await this.prompt('Include NonProfit configuration? (y/n)', 'y') === 'y';

            // Generate the template
            const template = {
                name: stateName,
                abbreviation: abbreviation.toUpperCase(),
                sosUrl: sosUrl,
                description: `Business registration configuration for ${stateName}`,
                lastUpdated: new Date().toISOString().split('T')[0],
                
                // URL patterns for detection
                urls: {
                    registration: [
                        `${sosUrl}/business/.*registration`,
                        `${sosUrl}/.*form.*LLC`,
                        `${sosUrl}/.*form.*corporation`
                    ],
                    search: [
                        `${sosUrl}/business/.*search`,
                        `${sosUrl}/.*entity.*search`
                    ]
                },
                
                // Entity type configurations
                entityTypes: {},
                
                // Common field mappings
                commonFieldMappings: {
                    entityName: {
                        selector: "input[name*='entity'], input[name*='business'], input[name*='company']",
                        type: "text",
                        validation: {
                            required: true,
                            minLength: 1,
                            maxLength: 255
                        }
                    },
                    agentName: {
                        selector: "input[name*='agent'], input[name*='registered']",
                        type: "text",
                        validation: {
                            required: true
                        }
                    },
                    agentAddress: {
                        street: "input[name*='agent_street'], input[name*='agent_address']",
                        city: "input[name*='agent_city']",
                        state: "select[name*='agent_state']",
                        zip: "input[name*='agent_zip']"
                    },
                    principalAddress: {
                        street: "input[name*='principal_street'], input[name*='business_address']",
                        city: "input[name*='principal_city']",
                        state: "select[name*='principal_state']",
                        zip: "input[name*='principal_zip']"
                    }
                },
                
                // Form-specific configurations
                formConfigurations: {
                    default: {
                        submitButton: "button[type='submit'], input[type='submit']",
                        requiredIndicator: ".required, *[required]",
                        errorContainer: ".error, .validation-error"
                    }
                },
                
                // Validation rules
                validationRules: {
                    entityName: {
                        pattern: "^[A-Za-z0-9\\s\\-\\.,'&]+$",
                        message: "Entity name can only contain letters, numbers, spaces, and common business characters"
                    },
                    ein: {
                        pattern: "^\\d{2}-\\d{7}$",
                        message: "EIN must be in format XX-XXXXXXX"
                    },
                    phone: {
                        pattern: "^\\(?\\d{3}\\)?[\\s\\-]?\\d{3}[\\s\\-]?\\d{4}$",
                        message: "Phone must be a valid US phone number"
                    }
                }
            };

            // Add entity type configurations
            if (includeLLC) {
                template.entityTypes.LLC = this.createEntityTypeTemplate('LLC', 'Limited Liability Company', sosUrl);
            }
            if (includeCorp) {
                template.entityTypes.Corporation = this.createEntityTypeTemplate('Corporation', 'Corporation', sosUrl);
            }
            if (includeNonProfit) {
                template.entityTypes.NonProfit = this.createEntityTypeTemplate('NonProfit', 'Non-Profit Organization', sosUrl);
            }

            // Save the template
            const fileName = `${stateName.toLowerCase().replace(/\s+/g, '_')}.json`;
            const filePath = path.join(__dirname, '..', 'knowledge', 'states', fileName);
            
            console.log(`\nSaving template to: ${filePath}`);
            fs.writeFileSync(filePath, JSON.stringify(template, null, 2));
            
            console.log('\n✅ Template generated successfully!');
            console.log('\n📝 Next steps:');
            console.log('1. Review and update the generated configuration');
            console.log('2. Add specific form URLs for each entity type');
            console.log('3. Update field selectors based on actual form inspection');
            console.log('4. Run validation: node tools/validateState.js ' + filePath);
            
        } catch (error) {
            console.error('❌ Error generating template:', error.message);
        } finally {
            this.rl.close();
        }
    }

    createEntityTypeTemplate(type, name, sosUrl) {
        return {
            name: name,
            description: `Registration form for ${name}`,
            urls: [
                `${sosUrl}/forms/${type.toLowerCase()}`,
                `${sosUrl}/business/register/${type.toLowerCase()}`
            ],
            formIdentifiers: {
                urlPatterns: [`.*${type.toLowerCase()}.*form`, `.*register.*${type.toLowerCase()}`],
                titlePatterns: [`${name} Registration`, `Form.*${type}`],
                formIdPatterns: [`${type.toLowerCase()}-form`, `register-${type.toLowerCase()}`]
            },
            fieldMappings: {
                entityType: {
                    selector: `select[name*='type'], input[value='${type}']`,
                    value: type,
                    type: "select"
                },
                purpose: {
                    selector: "textarea[name*='purpose'], input[name*='purpose']",
                    type: "textarea",
                    placeholder: `Describe the purpose of your ${name}`
                },
                duration: {
                    selector: "select[name*='duration'], input[name*='perpetual']",
                    type: "select",
                    options: ["Perpetual", "Fixed Term"]
                }
            },
            specificRequirements: {
                minimumMembers: type === 'LLC' ? 1 : (type === 'NonProfit' ? 3 : 1),
                requiredDocuments: [`${type} Articles`, "Operating Agreement"],
                filingFee: "TBD - Check state website"
            }
        };
    }
}

// CLI usage
if (require.main === module) {
    const generator = new StateTemplateGenerator();
    generator.generateTemplate();
}

module.exports = StateTemplateGenerator;