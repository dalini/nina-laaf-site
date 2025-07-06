const puppeteer = require('puppeteer');
const chalk = require('chalk');

class PerformanceTester {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.passed = [];
        this.browser = null;
        this.baseUrl = 'http://localhost:8081';
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

    async testPagePerformance(url, pageName) {
        const page = await this.browser.newPage();
        
        try {
            // Enable performance metrics
            await page.tracing.start({ screenshots: true, path: null });
            
            const start = Date.now();
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            const loadTime = Date.now() - start;

            // Get performance metrics
            const metrics = await page.metrics();
            const performanceEntries = await page.evaluate(() => {
                return JSON.stringify(performance.getEntriesByType('navigation'));
            });

            const navigation = JSON.parse(performanceEntries)[0];

            // Analyze load time
            if (loadTime < 2000) {
                this.passed.push(`${pageName}: Fast load time (${loadTime}ms)`);
            } else if (loadTime < 5000) {
                this.warnings.push(`${pageName}: Slow load time (${loadTime}ms)`);
            } else {
                this.errors.push(`${pageName}: Very slow load time (${loadTime}ms)`);
            }

            // Check DOM content loaded
            if (navigation && navigation.domContentLoadedEventEnd) {
                const domLoadTime = navigation.domContentLoadedEventEnd - navigation.navigationStart;
                if (domLoadTime < 1500) {
                    this.passed.push(`${pageName}: Fast DOM load (${Math.round(domLoadTime)}ms)`);
                } else {
                    this.warnings.push(`${pageName}: Slow DOM load (${Math.round(domLoadTime)}ms)`);
                }
            }

            // Check resource count
            const resourceCount = await page.evaluate(() => {
                return performance.getEntriesByType('resource').length;
            });

            if (resourceCount < 20) {
                this.passed.push(`${pageName}: Good resource count (${resourceCount})`);
            } else if (resourceCount < 50) {
                this.warnings.push(`${pageName}: High resource count (${resourceCount})`);
            } else {
                this.errors.push(`${pageName}: Very high resource count (${resourceCount})`);
            }

            // Check image optimization
            await this.checkImageOptimization(page, pageName);
            
            // Check CSS and JS optimization
            await this.checkAssetOptimization(page, pageName);

        } catch (error) {
            this.errors.push(`Performance test failed for ${pageName}: ${error.message}`);
        } finally {
            await page.close();
        }
    }

    async checkImageOptimization(page, pageName) {
        const imageInfo = await page.evaluate(() => {
            const images = Array.from(document.querySelectorAll('img'));
            return images.map(img => ({
                src: img.src,
                width: img.naturalWidth,
                height: img.naturalHeight,
                displayWidth: img.offsetWidth,
                displayHeight: img.offsetHeight
            }));
        });

        let oversizedImages = 0;
        let totalImages = imageInfo.length;

        for (const img of imageInfo) {
            // Check if image is significantly larger than display size
            if (img.width > img.displayWidth * 2 || img.height > img.displayHeight * 2) {
                oversizedImages++;
            }
        }

        if (totalImages === 0) {
            this.warnings.push(`${pageName}: No images found`);
        } else if (oversizedImages === 0) {
            this.passed.push(`${pageName}: All ${totalImages} images properly sized`);
        } else {
            this.warnings.push(`${pageName}: ${oversizedImages}/${totalImages} images oversized`);
        }
    }

    async checkAssetOptimization(page, pageName) {
        const resourceSizes = await page.evaluate(() => {
            const resources = performance.getEntriesByType('resource');
            const sizes = {
                css: 0,
                js: 0,
                images: 0,
                total: 0
            };

            resources.forEach(resource => {
                const transferSize = resource.transferSize || 0;
                sizes.total += transferSize;

                if (resource.name.includes('.css')) {
                    sizes.css += transferSize;
                } else if (resource.name.includes('.js')) {
                    sizes.js += transferSize;
                } else if (resource.name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
                    sizes.images += transferSize;
                }
            });

            return sizes;
        });

        // Convert to KB
        const totalKB = Math.round(resourceSizes.total / 1024);
        const cssKB = Math.round(resourceSizes.css / 1024);
        const jsKB = Math.round(resourceSizes.js / 1024);
        const imagesKB = Math.round(resourceSizes.images / 1024);

        // Check total page size
        if (totalKB < 500) {
            this.passed.push(`${pageName}: Good total size (${totalKB}KB)`);
        } else if (totalKB < 1000) {
            this.warnings.push(`${pageName}: Large total size (${totalKB}KB)`);
        } else {
            this.errors.push(`${pageName}: Very large total size (${totalKB}KB)`);
        }

        // Check CSS size
        if (cssKB < 50) {
            this.passed.push(`${pageName}: Good CSS size (${cssKB}KB)`);
        } else {
            this.warnings.push(`${pageName}: Large CSS size (${cssKB}KB)`);
        }

        // Check JS size
        if (jsKB < 100) {
            this.passed.push(`${pageName}: Good JS size (${jsKB}KB)`);
        } else {
            this.warnings.push(`${pageName}: Large JS size (${jsKB}KB)`);
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
        this.log('Starting performance tests...', 'info');
        
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
                await this.testPagePerformance(pageTest.url, pageTest.name);
            }

        } catch (error) {
            this.errors.push(`Performance test setup failed: ${error.message}`);
        } finally {
            if (this.browser) {
                await this.browser.close();
            }
            this.reportResults();
        }
    }

    reportResults() {
        console.log('\n' + chalk.bold('PERFORMANCE TEST RESULTS'));
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
            this.log('\n🎉 All performance tests passed!', 'success');
        }
    }
}

const tester = new PerformanceTester();
tester.run();