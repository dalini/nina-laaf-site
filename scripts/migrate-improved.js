const fs = require('fs');
const path = require('path');

// Configuration
const config = {
    dbPath: path.join(__dirname, '../current_site/c9_koken_nina_1.sql'),
    originalImagesPath: path.join(__dirname, '../current_site/webs/nina-laaf.de/web/koken/storage/originals'),
    customImagesPath: path.join(__dirname, '../current_site/webs/nina-laaf.de/web/koken/storage/custom'),
    outputPath: path.join(__dirname, '../content'),
    imagesOutputPath: path.join(__dirname, '../content')
};

// Helper functions
function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function createDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function copyImage(sourcePath, destPath) {
    if (fs.existsSync(sourcePath)) {
        createDirectory(path.dirname(destPath));
        fs.copyFileSync(sourcePath, destPath);
        console.log(`Copied: ${path.basename(sourcePath)} -> ${path.basename(destPath)}`);
        return true;
    }
    return false;
}

function findOriginalImage(filename) {
    // Search through the hex directory structure
    const hexDirs = fs.readdirSync(config.originalImagesPath);
    
    for (const dir1 of hexDirs) {
        const subPath = path.join(config.originalImagesPath, dir1);
        if (fs.statSync(subPath).isDirectory()) {
            const subDirs = fs.readdirSync(subPath);
            for (const dir2 of subDirs) {
                const imagePath = path.join(subPath, dir2, filename);
                if (fs.existsSync(imagePath)) {
                    return imagePath;
                }
                // Also check for .1600.jpg versions
                const resizedPath = path.join(subPath, dir2, filename.replace(/(\.[^.]+)$/, '.1600$1'));
                if (fs.existsSync(resizedPath)) {
                    return resizedPath;
                }
            }
        }
    }
    return null;
}

function createMarkdownFile(filePath, frontMatter, content = '') {
    const yamlFrontMatter = Object.entries(frontMatter)
        .filter(([key, value]) => value !== null && value !== undefined)
        .map(([key, value]) => {
            if (typeof value === 'string' && value.includes('\n')) {
                return `${key}: |\n  ${value.replace(/\n/g, '\n  ')}`;
            }
            if (Array.isArray(value)) {
                return `${key}:\n${value.map(item => `  - ${JSON.stringify(item)}`).join('\n')}`;
            }
            return `${key}: ${JSON.stringify(value)}`;
        })
        .join('\n');

    const markdown = `---\n${yamlFrontMatter}\n---\n\n${content}`;
    fs.writeFileSync(filePath, markdown, 'utf8');
    console.log(`Created: ${path.basename(filePath)}`);
}

function parseCSVValues(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    let escapeNext = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (escapeNext) {
            current += char;
            escapeNext = false;
            continue;
        }
        
        if (char === '\\') {
            escapeNext = true;
            continue;
        }
        
        if (char === "'" && !inQuotes) {
            inQuotes = true;
            continue;
        }
        
        if (char === "'" && inQuotes) {
            inQuotes = false;
            continue;
        }
        
        if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
            continue;
        }
        
        current += char;
    }
    
    if (current.trim()) {
        values.push(current.trim());
    }
    
    return values.map(v => v === 'NULL' ? null : v);
}

function timestampToDate(timestamp) {
    if (!timestamp || timestamp === 'NULL') return null;
    const ts = parseInt(timestamp);
    if (isNaN(ts) || ts <= 0) return null;
    return new Date(ts * 1000).toISOString().split('T')[0];
}

// Main migration function
async function migrate() {
    console.log('Starting improved migration...');
    
    // Create output directories
    createDirectory(config.outputPath);
    createDirectory(path.join(config.outputPath, 'works'));
    createDirectory(path.join(config.outputPath, 'essays'));
    createDirectory(path.join(config.outputPath, 'news'));
    createDirectory(path.join(config.outputPath, 'cv'));

    // Read SQL file
    const sqlContent = fs.readFileSync(config.dbPath, 'utf8');
    
    // Parse albums data
    const albumsMatch = sqlContent.match(/INSERT INTO `koken_albums`[^;]+;/s);
    const albums = [];
    
    if (albumsMatch) {
        const albumsData = albumsMatch[0];
        const valuesRegex = /\(([^)]+)\)/g;
        let match;
        
        while ((match = valuesRegex.exec(albumsData)) !== null) {
            const values = parseCSVValues(match[1]);
            if (values.length >= 23) {
                albums.push({
                    id: parseInt(values[0]),
                    title: values[1],
                    slug: values[2],
                    summary: values[3],
                    description: values[4],
                    listed: parseInt(values[5]),
                    level: parseInt(values[6]),
                    deleted: parseInt(values[9]),
                    featured: parseInt(values[10]),
                    total_count: parseInt(values[13]),
                    published_on: values[15] ? timestampToDate(values[15]) : null,
                    created_on: values[16] ? timestampToDate(values[16]) : null,
                    visibility: parseInt(values[22])
                });
            }
        }
    }
    
    // Parse content data
    const contentMatch = sqlContent.match(/INSERT INTO `koken_content`[^;]+;/s);
    const contents = [];
    
    if (contentMatch) {
        const contentData = contentMatch[0];
        const valuesRegex = /\(([^)]+)\)/g;
        let match;
        
        while ((match = valuesRegex.exec(contentData)) !== null) {
            const values = parseCSVValues(match[1]);
            if (values.length >= 30) {
                contents.push({
                    id: parseInt(values[0]),
                    title: values[1],
                    slug: values[2],
                    filename: values[4],
                    caption: values[5],
                    visibility: parseInt(values[6]),
                    deleted: parseInt(values[9]),
                    featured: parseInt(values[10]),
                    uploaded_on: values[16] ? timestampToDate(values[16]) : null,
                    captured_on: values[17] ? timestampToDate(values[17]) : null,
                    published_on: values[18] ? timestampToDate(values[18]) : null
                });
            }
        }
    }
    
    // Parse album-content relationships
    const albumContentMatch = sqlContent.match(/INSERT INTO `koken_join_albums_content`[^;]+;/s);
    const albumContentMap = new Map();
    
    if (albumContentMatch) {
        const relationData = albumContentMatch[0];
        const valuesRegex = /\(([^)]+)\)/g;
        let match;
        
        while ((match = valuesRegex.exec(relationData)) !== null) {
            const values = parseCSVValues(match[1]);
            if (values.length >= 3) {
                const albumId = parseInt(values[0]);
                const contentId = parseInt(values[1]);
                const order = parseInt(values[2]);
                
                if (!albumContentMap.has(albumId)) {
                    albumContentMap.set(albumId, []);
                }
                albumContentMap.get(albumId).push({ contentId, order });
            }
        }
    }
    
    console.log(`Found ${albums.length} albums, ${contents.length} content items`);
    
    // Create work pages for each album
    for (const album of albums) {
        if (album.title && album.deleted === 0 && album.listed === 1) {
            const workSlug = slugify(album.title);
            const workDir = path.join(config.outputPath, 'works', workSlug);
            const imagesDir = path.join(workDir, 'images');
            
            createDirectory(workDir);
            createDirectory(imagesDir);

            // Get associated content/images
            const albumImages = [];
            const contentRelations = albumContentMap.get(album.id) || [];
            
            // Sort by order
            contentRelations.sort((a, b) => a.order - b.order);
            
            for (const relation of contentRelations) {
                const content = contents.find(c => c.id === relation.contentId);
                if (content && content.filename && content.deleted === 0) {
                    const originalPath = findOriginalImage(content.filename);
                    if (originalPath) {
                        const ext = path.extname(content.filename);
                        const imageName = `${slugify(content.title || content.filename.replace(ext, ''))}${ext}`;
                        const destPath = path.join(imagesDir, imageName);
                        
                        if (copyImage(originalPath, destPath)) {
                            albumImages.push({
                                src: `images/${imageName}`,
                                alt: content.title || content.caption || album.title,
                                caption: content.caption || null,
                                order: relation.order
                            });
                        }
                    }
                }
            }

            // Create markdown file
            const frontMatter = {
                title: album.title,
                slug: workSlug,
                layout: 'work.njk',
                summary: album.summary || null,
                description: album.description || null,
                featured: album.featured === 1 || albumImages.length > 0,
                featured_image: albumImages.length > 0 ? albumImages[0].src : null,
                published_on: album.published_on,
                created_on: album.created_on,
                total_count: album.total_count,
                images: albumImages.length > 0 ? albumImages : null
            };

            const content = album.description || '';
            const markdownPath = path.join(workDir, 'index.md');
            createMarkdownFile(markdownPath, frontMatter, content);
        }
    }
    
    // Parse text content (essays, pages)
    const textMatch = sqlContent.match(/INSERT INTO `koken_text`[^;]+;/s);
    
    if (textMatch) {
        const textData = textMatch[0];
        const valuesRegex = /\(([^)]+)\)/g;
        let match;
        
        while ((match = valuesRegex.exec(textData)) !== null) {
            const values = parseCSVValues(match[1]);
            if (values.length >= 15 && values[1]) {
                const title = values[1];
                const slug = values[2];
                const content = values[3];
                const excerpt = values[4];
                const published = parseInt(values[5]);
                const publishedOn = values[6] ? timestampToDate(values[6]) : null;
                const createdOn = values[7] ? timestampToDate(values[7]) : null;
                const pageType = parseInt(values[13]); // 0=essay, 1=page
                
                if (published === 1) {
                    const frontMatter = {
                        title: title,
                        slug: slug,
                        layout: 'base.njk',
                        excerpt: excerpt || null,
                        published_on: publishedOn,
                        created_on: createdOn,
                        date: publishedOn || createdOn
                    };

                    if (pageType === 0) { // Essay
                        const essayPath = path.join(config.outputPath, 'essays', `${slugify(title)}.md`);
                        createMarkdownFile(essayPath, frontMatter, content);
                    } else if (pageType === 1) { // Page (like CV)
                        const pagePath = path.join(config.outputPath, 'cv', 'index.md');
                        createMarkdownFile(pagePath, frontMatter, content);
                    }
                }
            }
        }
    }

    // Copy custom images
    if (fs.existsSync(config.customImagesPath)) {
        const customFiles = fs.readdirSync(config.customImagesPath);
        const customDir = path.join(config.outputPath, 'custom');
        createDirectory(customDir);
        
        customFiles.forEach(file => {
            if (file.match(/\.(jpg|jpeg|png|gif)$/i)) {
                const sourcePath = path.join(config.customImagesPath, file);
                const destPath = path.join(customDir, file);
                copyImage(sourcePath, destPath);
            }
        });
    }

    console.log('\nMigration completed successfully!');
    console.log(`Created content in: ${config.outputPath}`);
    console.log(`\nSummary:`);
    console.log(`- ${albums.filter(a => a.deleted === 0 && a.listed === 1).length} work series migrated`);
    console.log(`- ${contents.filter(c => c.deleted === 0).length} images processed`);
    console.log('\nNext steps:');
    console.log('1. Run: npm start');
    console.log('2. Visit: http://localhost:8080');
}

// Run migration
migrate().catch(console.error);