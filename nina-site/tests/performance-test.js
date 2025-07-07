const fs = require('fs');
const path = require('path');

async function runPerformanceTests() {
    console.log('🔍 Running performance tests...');
    
    const siteDir = path.join(__dirname, '../_site');
    
    if (!fs.existsSync(siteDir)) {
        console.error('❌ Site directory not found. Run npm run build first.');
        process.exit(1);
    }
    
    try {
        const puppeteer = require('puppeteer');
        
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        
        // Test main pages
        const testPages = [
            'index.html',
            'works/index.html',
            'essays/index.html'
        ];
        
        let results = [];
        
        for (const testPage of testPages) {
            const filePath = path.join(siteDir, testPage);
            
            if (fs.existsSync(filePath)) {
                await page.goto(`file://${filePath}`);
                
                // Measure performance
                const metrics = await page.metrics();
                const timing = await page.evaluate(() => {
                    const navigation = performance.getEntriesByType('navigation')[0];
                    return {
                        loadTime: navigation.loadEventEnd - navigation.loadEventStart,
                        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
                        firstPaint: performance.getEntriesByType('paint').find(entry => entry.name === 'first-paint')?.startTime || 0
                    };
                });
                
                results.push({
                    page: testPage,
                    loadTime: timing.loadTime,
                    domContentLoaded: timing.domContentLoaded,
                    firstPaint: timing.firstPaint,
                    jsHeapUsedSize: metrics.JSHeapUsedSize,
                    jsHeapTotalSize: metrics.JSHeapTotalSize
                });
                
                console.log(`📊 ${testPage}:`);
                console.log(`   Load time: ${timing.loadTime.toFixed(2)}ms`);
                console.log(`   DOM ready: ${timing.domContentLoaded.toFixed(2)}ms`);
                console.log(`   First paint: ${timing.firstPaint.toFixed(2)}ms`);
                console.log(`   JS heap used: ${(metrics.JSHeapUsedSize / 1024 / 1024).toFixed(2)}MB`);
            }
        }
        
        await browser.close();
        
        // Check if any page is too slow
        const slowPages = results.filter(result => result.loadTime > 3000); // 3 seconds
        
        console.log(`\n📊 Performance test results:`);
        console.log(`   Pages tested: ${results.length}`);
        console.log(`   Slow pages (>3s): ${slowPages.length}`);
        
        if (slowPages.length > 0) {
            console.warn(`\n⚠️  Found ${slowPages.length} slow-loading pages`);
            slowPages.forEach(page => {
                console.warn(`   - ${page.page}: ${page.loadTime.toFixed(2)}ms`);
            });
        } else {
            console.log(`\n✅ All pages load quickly (<3s)`);
        }
        
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
            console.log('⚠️  Puppeteer not installed, skipping performance tests');
        } else {
            throw error;
        }
    }
}

runPerformanceTests();