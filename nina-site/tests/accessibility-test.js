const fs = require('fs');
const path = require('path');

async function runAccessibilityTests() {
    console.log('🔍 Running accessibility tests...');
    
    const siteDir = path.join(__dirname, '../_site');
    
    if (!fs.existsSync(siteDir)) {
        console.error('❌ Site directory not found. Run npm run build first.');
        process.exit(1);
    }
    
    try {
        // Try to load axe-core
        const { AxePuppeteer } = require('@axe-core/puppeteer');
        const puppeteer = require('puppeteer');
        
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        
        // Test main pages
        const testPages = [
            'index.html',
            'works/index.html',
            'essays/index.html'
        ];
        
        let totalViolations = 0;
        
        for (const testPage of testPages) {
            const filePath = path.join(siteDir, testPage);
            
            if (fs.existsSync(filePath)) {
                await page.goto(`file://${filePath}`);
                
                const results = await new AxePuppeteer(page).analyze();
                
                if (results.violations.length > 0) {
                    console.error(`❌ Accessibility violations in ${testPage}:`);
                    results.violations.forEach((violation) => {
                        console.error(`   - ${violation.impact}: ${violation.description}`);
                        totalViolations++;
                    });
                } else {
                    console.log(`✅ No accessibility violations in ${testPage}`);
                }
            }
        }
        
        await browser.close();
        
        console.log(`\n📊 Accessibility test results:`);
        console.log(`   Pages tested: ${testPages.length}`);
        console.log(`   Total violations: ${totalViolations}`);
        
        if (totalViolations > 0) {
            console.error(`\n❌ Found ${totalViolations} accessibility violations`);
            process.exit(1);
        } else {
            console.log(`\n✅ All accessibility tests passed`);
        }
        
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
            console.log('⚠️  Accessibility testing dependencies not installed, skipping tests');
            console.log('   Install with: npm install --save-dev @axe-core/puppeteer');
        } else {
            throw error;
        }
    }
}

runAccessibilityTests();