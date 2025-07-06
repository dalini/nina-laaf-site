const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class ContentValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.passed = [];
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

    validateWorkContent() {
        const worksDir = path.join(__dirname, '../content/works');
        
        if (!fs.existsSync(worksDir)) {
            this.errors.push('Works directory does not exist');
            return;
        }

        const workDirs = fs.readdirSync(worksDir);
        
        for (const workDir of workDirs) {
            const workPath = path.join(worksDir, workDir);
            const indexPath = path.join(workPath, 'index.md');
            const imagesPath = path.join(workPath, 'images');

            // Check if index.md exists
            if (!fs.existsSync(indexPath)) {
                this.errors.push(`Missing index.md for work: ${workDir}`);
                continue;
            }

            // Read and validate frontmatter
            const content = fs.readFileSync(indexPath, 'utf8');
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
            
            if (!frontmatterMatch) {
                this.errors.push(`Invalid frontmatter in work: ${workDir}`);
                continue;
            }

            const frontmatter = frontmatterMatch[1];
            
            // Required fields
            const requiredFields = ['title', 'slug', 'layout', 'permalink'];
            for (const field of requiredFields) {
                if (!frontmatter.includes(`${field}:`)) {
                    this.errors.push(`Missing required field '${field}' in work: ${workDir}`);
                }
            }

            // Check if images directory exists
            if (!fs.existsSync(imagesPath)) {
                this.warnings.push(`No images directory for work: ${workDir}`);
            } else {
                const images = fs.readdirSync(imagesPath);
                if (images.length === 0) {
                    this.warnings.push(`Empty images directory for work: ${workDir}`);
                } else {
                    // Validate image references in frontmatter
                    if (frontmatter.includes('featured_image:')) {
                        const featuredImageMatch = frontmatter.match(/featured_image:\s*"([^"]+)"/);
                        if (featuredImageMatch) {
                            const imagePath = featuredImageMatch[1].replace(/^\/works\/[^\/]+\//, '');
                            if (!images.includes(imagePath)) {
                                this.errors.push(`Featured image not found: ${imagePath} in work: ${workDir}`);
                            }
                        }
                    }
                }
            }

            this.passed.push(`Work validation passed: ${workDir}`);
        }
    }

    validateSiteStructure() {
        const requiredFiles = [
            'package.json',
            '.eleventy.js',
            'src/_layouts/base.njk',
            'src/_layouts/work.njk',
            'src/css/main.css',
            'index.njk',
            'works/index.njk'
        ];

        for (const file of requiredFiles) {
            const filePath = path.join(__dirname, '..', file);
            if (!fs.existsSync(filePath)) {
                this.errors.push(`Required file missing: ${file}`);
            } else {
                this.passed.push(`File exists: ${file}`);
            }
        }
    }

    validateBuildOutput() {
        const siteDir = path.join(__dirname, '../_site');
        
        if (!fs.existsSync(siteDir)) {
            this.errors.push('Build output directory (_site) does not exist');
            return;
        }

        const requiredPages = [
            'index.html',
            'works/index.html',
            'css/main.css'
        ];

        for (const page of requiredPages) {
            const pagePath = path.join(siteDir, page);
            if (!fs.existsSync(pagePath)) {
                this.errors.push(`Built page missing: ${page}`);
            } else {
                this.passed.push(`Built page exists: ${page}`);
            }
        }

        // Check work pages
        const worksDir = path.join(siteDir, 'works');
        if (fs.existsSync(worksDir)) {
            const workPages = fs.readdirSync(worksDir).filter(item => {
                const itemPath = path.join(worksDir, item);
                return fs.statSync(itemPath).isDirectory();
            });

            if (workPages.length === 0) {
                this.errors.push('No work pages found in build output');
            } else {
                this.passed.push(`Found ${workPages.length} work pages in build output`);
                
                // Check each work page has index.html
                for (const workPage of workPages) {
                    const indexPath = path.join(worksDir, workPage, 'index.html');
                    if (!fs.existsSync(indexPath)) {
                        this.errors.push(`Work page missing index.html: ${workPage}`);
                    }
                }
            }
        }
    }

    run() {
        this.log('Starting content validation...', 'info');
        
        this.validateSiteStructure();
        this.validateWorkContent();
        this.validateBuildOutput();

        // Report results
        console.log('\n' + chalk.bold('VALIDATION RESULTS'));
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
            this.log('\n🎉 All content validation tests passed!', 'success');
        }
    }
}

const validator = new ContentValidator();
validator.run();