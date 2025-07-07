const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function findHtmlFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    
    list.forEach((file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat && stat.isDirectory()) {
            results = results.concat(findHtmlFiles(filePath));
        } else if (file.endsWith('.html')) {
            results.push(filePath);
        }
    });
    
    return results;
}

function checkLinks() {
    const siteDir = path.join(__dirname, '../_site');
    
    if (!fs.existsSync(siteDir)) {
        console.error('❌ Site directory not found. Run npm run build first.');
        process.exit(1);
    }
    
    const htmlFiles = findHtmlFiles(siteDir);
    let totalLinks = 0;
    let brokenLinks = 0;
    
    console.log('🔍 Checking internal links...');
    
    htmlFiles.forEach((filePath) => {
        const content = fs.readFileSync(filePath, 'utf8');
        const dom = new JSDOM(content);
        const links = dom.window.document.querySelectorAll('a[href]');
        
        links.forEach((link) => {
            const href = link.getAttribute('href');
            
            // Skip external links and anchors
            if (href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:')) {
                return;
            }
            
            totalLinks++;
            
            // Convert relative link to absolute file path
            let targetPath;
            if (href.startsWith('/')) {
                targetPath = path.join(siteDir, href);
            } else {
                targetPath = path.resolve(path.dirname(filePath), href);
            }
            
            // If it's a directory, check for index.html
            if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                targetPath = path.join(targetPath, 'index.html');
            }
            
            // If no extension, assume .html
            if (!path.extname(targetPath)) {
                targetPath += '.html';
            }
            
            if (!fs.existsSync(targetPath)) {
                console.error(`❌ Broken link: ${href} in ${path.relative(siteDir, filePath)}`);
                brokenLinks++;
            }
        });
    });
    
    console.log(`\n📊 Link check results:`);
    console.log(`   Total internal links: ${totalLinks}`);
    console.log(`   Broken links: ${brokenLinks}`);
    
    if (brokenLinks > 0) {
        console.error(`\n❌ Found ${brokenLinks} broken links`);
        process.exit(1);
    } else {
        console.log(`\n✅ All internal links are working`);
    }
}

// Only require jsdom if we're actually running the test
try {
    checkLinks();
} catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('jsdom')) {
        console.log('⚠️  jsdom not installed, skipping link checking');
        console.log('   Install with: npm install --save-dev jsdom');
    } else {
        throw error;
    }
}