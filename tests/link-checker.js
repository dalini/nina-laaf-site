const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class LinkChecker {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.passed = [];
        this.baseDir = path.join(__dirname, '../_site');
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

    extractLinks(htmlContent, filePath) {
        const links = [];
        
        // Extract href links
        const hrefRegex = /href=["']([^"']+)["']/g;
        let match;
        while ((match = hrefRegex.exec(htmlContent)) !== null) {
            const href = match[1];
            // Skip external links, mailto, tel, and anchors
            if (!href.startsWith('http') && !href.startsWith('mailto:') && 
                !href.startsWith('tel:') && !href.startsWith('#')) {
                links.push({
                    url: href,
                    type: 'href',
                    source: filePath
                });
            }
        }

        // Extract src links (images, scripts, etc.)
        const srcRegex = /src=["']([^"']+)["']/g;
        while ((match = srcRegex.exec(htmlContent)) !== null) {
            const src = match[1];
            // Skip external URLs and data URLs
            if (!src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('//')) {
                links.push({
                    url: src,
                    type: 'src',
                    source: filePath
                });
            }
        }

        return links;
    }

    resolveUrl(url, basePath) {
        // Handle absolute URLs starting with /
        if (url.startsWith('/')) {
            return path.join(this.baseDir, url.substring(1));
        }
        
        // Handle relative URLs
        const dir = path.dirname(basePath);
        return path.resolve(dir, url);
    }

    checkLink(link) {
        let targetPath = this.resolveUrl(link.url, link.source);
        
        // If URL ends with /, try index.html
        if (targetPath.endsWith('/') || fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
            targetPath = path.join(targetPath, 'index.html');
        }

        if (fs.existsSync(targetPath)) {
            this.passed.push(`Link OK: ${link.url} (${link.type}) in ${path.relative(this.baseDir, link.source)}`);
            return true;
        } else {
            this.errors.push(`Broken link: ${link.url} (${link.type}) in ${path.relative(this.baseDir, link.source)} -> ${targetPath}`);
            return false;
        }
    }

    scanDirectory(dir) {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const itemPath = path.join(dir, item);
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory()) {
                this.scanDirectory(itemPath);
            } else if (item.endsWith('.html')) {
                this.scanHtmlFile(itemPath);
            }
        }
    }

    scanHtmlFile(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        const links = this.extractLinks(content, filePath);
        
        for (const link of links) {
            this.checkLink(link);
        }
    }

    checkNavigation() {
        // Test critical navigation paths
        const criticalPaths = [
            '/',
            '/works/',
            '/works/lackierung-faltung-crash/',
            '/works/raumforderung/',
            '/works/coc-n/'
        ];

        for (const urlPath of criticalPaths) {
            let filePath = path.join(this.baseDir, urlPath.substring(1));
            if (filePath.endsWith('/') || fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
                filePath = path.join(filePath, 'index.html');
            }

            if (fs.existsSync(filePath)) {
                this.passed.push(`Critical path exists: ${urlPath}`);
            } else {
                this.errors.push(`Critical path missing: ${urlPath} -> ${filePath}`);
            }
        }
    }

    run() {
        this.log('Starting link checker...', 'info');
        
        if (!fs.existsSync(this.baseDir)) {
            this.errors.push('Build directory (_site) does not exist. Run "npm run build" first.');
            this.reportResults();
            return;
        }

        this.checkNavigation();
        this.scanDirectory(this.baseDir);
        this.reportResults();
    }

    reportResults() {
        console.log('\n' + chalk.bold('LINK CHECKER RESULTS'));
        console.log('='.repeat(50));

        if (this.passed.length > 0) {
            this.log(`\n✅ PASSED (${this.passed.length}):`, 'success');
            // Only show first 10 passed links to avoid spam
            this.passed.slice(0, 10).forEach(msg => this.log(`  ${msg}`, 'success'));
            if (this.passed.length > 10) {
                this.log(`  ... and ${this.passed.length - 10} more`, 'success');
            }
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
            this.log('\n🎉 All links are working!', 'success');
        }
    }
}

const checker = new LinkChecker();
checker.run();