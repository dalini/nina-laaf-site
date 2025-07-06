const puppeteer = require('puppeteer');
const axeCore = require('axe-core');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

class AccessibilityTester {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.passed = [];
        this.browser = null;
        this.baseUrl = 'http://localhost:8081'; // Adjust if different
    }

    log(message, type = 'info') {
        const colors = {
            error: chalk.red,
            warning: chalk.yellow,
            success: chalk.green,
            info: chalk.blue
        };
        console.log(colors[type](`[${type.toUpperCase()}] ${message}`));
    }

    async testPage(url, pageName) {
        const page = await this.browser.newPage();
        
        try {
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 10000 });
            
            // Inject axe-core
            await page.evaluate(axeCore.source);
            
            // Run axe accessibility tests
            const results = await page.evaluate(() => {
                return axe.run();
            });

            // Process results
            if (results.violations.length === 0) {
                this.passed.push(`Accessibility passed: ${pageName} (${url})`);
            } else {
                for (const violation of results.violations) {
                    const impact = violation.impact || 'unknown';
                    const message = `${pageName}: ${violation.description} (${impact}) - ${violation.nodes.length} instances`;
                    
                    if (impact === 'critical' || impact === 'serious') {
                        this.errors.push(message);
                    } else {
                        this.warnings.push(message);
                    }
                }
            }

            // Additional manual checks
            await this.checkBasicAccessibility(page, pageName);
            
        } catch (error) {
            this.errors.push(`Failed to test ${pageName}: ${error.message}`);
        } finally {
            await page.close();
        }
    }

    async checkBasicAccessibility(page, pageName) {
        // Check for page title
        const title = await page.title();
        if (!title || title.trim() === '') {
            this.errors.push(`${pageName}: Missing page title`);
        } else {
            this.passed.push(`${pageName}: Has page title`);
        }

        // Check for heading structure
        const headings = await page.evaluate(() => {
            const h1s = document.querySelectorAll('h1');
            const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
            return {
                h1Count: h1s.length,
                totalHeadings: headings.length
            };
        });

        if (headings.h1Count === 0) {
            this.errors.push(`${pageName}: Missing h1 heading`);
        } else if (headings.h1Count > 1) {
            this.warnings.push(`${pageName}: Multiple h1 headings found`);
        } else {
            this.passed.push(`${pageName}: Proper h1 heading structure`);
        }

        // Check for alt text on images
        const imageIssues = await page.evaluate(() => {
            const images = document.querySelectorAll('img');
            let missingAlt = 0;
            let emptyAlt = 0;
            
            images.forEach(img => {
                if (!img.hasAttribute('alt')) {
                    missingAlt++;
                } else if (img.alt.trim() === '') {
                    emptyAlt++;
                }
            });
            
            return { total: images.length, missingAlt, emptyAlt };
        });

        if (imageIssues.missingAlt > 0) {
            this.errors.push(`${pageName}: ${imageIssues.missingAlt} images missing alt attribute`);
        }
        
        if (imageIssues.emptyAlt > 0) {
            this.warnings.push(`${pageName}: ${imageIssues.emptyAlt} images with empty alt text`);
        }
        
        if (imageIssues.total > 0 && imageIssues.missingAlt === 0 && imageIssues.emptyAlt === 0) {
            this.passed.push(`${pageName}: All images have alt text`);
        }

        // Check for keyboard navigation
        const focusableElements = await page.evaluate(() => {
            const focusable = document.querySelectorAll('a, button, input, textarea, select, [tabindex]');
            return focusable.length;
        });

        if (focusableElements > 0) {
            this.passed.push(`${pageName}: Has ${focusableElements} focusable elements`);
        }
    }

    async isServerRunning() {
        try {
            const page = await this.browser.newPage();
            await page.goto(this.baseUrl, { timeout: 5000 });
            await page.close();
            return true;
        } catch (error) {
            return false;
        }
    }

    async run() {
        this.log('Starting accessibility tests...', 'info');
        
        try {
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            // Check if development server is running
            if (!(await this.isServerRunning())) {
                this.errors.push(`Development server not running at ${this.baseUrl}. Start with "npm start"`);
                this.reportResults();
                return;
            }

            // Test critical pages
            const pagesToTest = [
                { url: `${this.baseUrl}/`, name: 'Homepage' },
                { url: `${this.baseUrl}/works/`, name: 'Works Index' },
                { url: `${this.baseUrl}/works/lackierung-faltung-crash/`, name: 'Work Detail' }
            ];

            for (const pageTest of pagesToTest) {
                await this.testPage(pageTest.url, pageTest.name);
            }

        } catch (error) {
            this.errors.push(`Test setup failed: ${error.message}`);
        } finally {
            if (this.browser) {
                await this.browser.close();
            }
            this.reportResults();
        }
    }

    reportResults() {
        console.log('\n' + chalk.bold('ACCESSIBILITY TEST RESULTS'));
        console.log('='.repeat(50));

        if (this.passed.length > 0) {
            this.log(`\n✅ PASSED (${this.passed.length}):`, 'success');
            this.passed.forEach(msg => this.log(`  ${msg}`, 'success'));
        }

        if (this.warnings.length > 0) {
            this.log(`\n⚠️  WARNINGS (${this.warnings.length}):`, 'warning');
            this.warnings.forEach(msg => this.log(`  ${msg}`, 'warning'));
        }

        if (this.errors.length > 0) {
            this.log(`\n❌ ERRORS (${this.errors.length}):`, 'error');
            this.errors.forEach(msg => this.log(`  ${msg}`, 'error'));
            process.exit(1);
        } else {
            this.log('\n🎉 All accessibility tests passed!', 'success');
        }
    }
}

const tester = new AccessibilityTester();
tester.run();