const fs = require('fs');
const path = require('path');

function validateContent() {
    console.log('🔍 Validating content structure...');
    
    const contentDir = path.join(__dirname, '../content/works');
    const siteDir = path.join(__dirname, '../_site');
    
    if (!fs.existsSync(contentDir)) {
        console.error('❌ Content directory not found.');
        process.exit(1);
    }
    
    if (!fs.existsSync(siteDir)) {
        console.error('❌ Site directory not found. Run npm run build first.');
        process.exit(1);
    }
    
    let totalWorks = 0;
    let missingImages = 0;
    let missingContent = 0;
    let generatedPages = 0;
    
    // Check each work
    const works = fs.readdirSync(contentDir);
    
    works.forEach((work) => {
        const workDir = path.join(contentDir, work);
        const stat = fs.statSync(workDir);
        
        if (stat.isDirectory()) {
            totalWorks++;
            
            // Check for index.md
            const indexPath = path.join(workDir, 'index.md');
            if (!fs.existsSync(indexPath)) {
                console.error(`❌ Missing index.md for work: ${work}`);
                missingContent++;
            } else {
                // Validate frontmatter
                const content = fs.readFileSync(indexPath, 'utf8');
                if (!content.includes('---')) {
                    console.error(`❌ Missing frontmatter in: ${work}/index.md`);
                    missingContent++;
                }
            }
            
            // Check for images directory
            const imagesDir = path.join(workDir, 'images');
            if (fs.existsSync(imagesDir)) {
                const images = fs.readdirSync(imagesDir);
                if (images.length === 0) {
                    console.warn(`⚠️  No images found for work: ${work}`);
                    missingImages++;
                }
            } else {
                console.warn(`⚠️  Images directory missing for work: ${work}`);
                missingImages++;
            }
            
            // Check if page was generated
            const generatedPath = path.join(siteDir, 'works', work, 'index.html');
            if (fs.existsSync(generatedPath)) {
                generatedPages++;
            } else {
                console.error(`❌ Page not generated for work: ${work}`);
            }
        }
    });
    
    // Check for essential pages
    const essentialPages = [
        'index.html',
        'works/index.html',
        'essays/index.html'
    ];
    
    let missingPages = 0;
    essentialPages.forEach((page) => {
        const pagePath = path.join(siteDir, page);
        if (!fs.existsSync(pagePath)) {
            console.error(`❌ Essential page missing: ${page}`);
            missingPages++;
        }
    });
    
    console.log(`\n📊 Content validation results:`);
    console.log(`   Total works: ${totalWorks}`);
    console.log(`   Generated pages: ${generatedPages}`);
    console.log(`   Missing content: ${missingContent}`);
    console.log(`   Missing images: ${missingImages}`);
    console.log(`   Missing essential pages: ${missingPages}`);
    
    const totalIssues = missingContent + missingPages;
    
    if (totalIssues > 0) {
        console.error(`\n❌ Found ${totalIssues} critical content issues`);
        process.exit(1);
    } else {
        console.log(`\n✅ Content validation passed`);
    }
}

validateContent();