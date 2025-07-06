const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Configuration
const config = {
    dbPath: path.join(__dirname, '../current_site/koken.sqlite'),
    originalImagesPath: path.join(__dirname, '../current_site/webs/nina-laaf.de/web/koken/storage/originals'),
    customImagesPath: path.join(__dirname, '../current_site/webs/nina-laaf.de/web/koken/storage/custom'),
    outputPath: path.join(__dirname, '../content')
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

function createMarkdownFile(filePath, frontMatter, content = '') {
    const yamlFrontMatter = Object.entries(frontMatter)
        .filter(([key, value]) => value !== null && value !== undefined)
        .map(([key, value]) => {
            if (typeof value === 'string' && value.includes('\n')) {
                return `${key}: |\n  ${value.replace(/\n/g, '\n  ')}`;
            }
            return `${key}: ${JSON.stringify(value)}`;
        })
        .filter(line => line !== null)
        .join('\n');

    const markdown = `---\n${yamlFrontMatter}\n---\n\n${content}`;
    fs.writeFileSync(filePath, markdown, 'utf8');
    console.log(`Created: ${path.basename(path.dirname(filePath))}/${path.basename(filePath)}`);
}

function timestampToDate(timestamp) {
    if (!timestamp) return null;
    const ts = parseInt(timestamp);
    if (isNaN(ts) || ts <= 0) return null;
    return new Date(ts * 1000).toISOString().split('T')[0];
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

function copyImage(sourcePath, destPath) {
    if (fs.existsSync(sourcePath)) {
        createDirectory(path.dirname(destPath));
        fs.copyFileSync(sourcePath, destPath);
        console.log(`Copied: ${path.basename(sourcePath)} -> ${path.basename(destPath)}`);
        return true;
    }
    return false;
}

// Database query functions
function queryAlbums(db) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT * FROM koken_albums 
            WHERE deleted = 0 AND listed = 1 AND visibility = 0 AND title IS NOT NULL
            ORDER BY created_on DESC
        `;
        
        db.all(query, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                console.log(`Found ${rows.length} published albums in database`);
                resolve(rows);
            }
        });
    });
}

function queryContent(db) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT * FROM koken_content 
            WHERE deleted = 0 AND filename IS NOT NULL
            ORDER BY uploaded_on DESC
        `;
        
        db.all(query, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                console.log(`Found ${rows.length} content items in database`);
                resolve(rows);
            }
        });
    });
}

function queryAlbumContentRelations(db) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT album_id, content_id, \`order\` FROM koken_join_albums_content
            ORDER BY album_id, \`order\`
        `;
        
        db.all(query, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                console.log(`Found ${rows.length} album-content relationships`);
                resolve(rows);
            }
        });
    });
}

function queryTextContent(db) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT * FROM koken_text 
            WHERE published = 1
            ORDER BY created_on DESC
        `;
        
        db.all(query, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                console.log(`Found ${rows.length} text content items`);
                resolve(rows);
            }
        });
    });
}

// Main migration function
async function migrate() {
    console.log('Starting SQLite-based migration...');
    
    // Check if database exists
    if (!fs.existsSync(config.dbPath)) {
        console.error(`Database not found at ${config.dbPath}`);
        console.log('Please run create-sqlite-db.js first');
        return;
    }
    
    // Clean existing content
    const worksDir = path.join(config.outputPath, 'works');
    if (fs.existsSync(worksDir)) {
        fs.rmSync(worksDir, { recursive: true });
    }
    createDirectory(worksDir);
    
    // Open database
    const db = new sqlite3.Database(config.dbPath, (err) => {
        if (err) {
            console.error('Error opening database:', err);
            return;
        }
        console.log('Connected to SQLite database');
    });
    
    try {
        // Query all data
        const [albums, contents, relations, textContent] = await Promise.all([
            queryAlbums(db),
            queryContent(db),
            queryAlbumContentRelations(db),
            queryTextContent(db)
        ]);
        
        // Create content map for quick lookup
        const contentMap = new Map();
        contents.forEach(content => {
            contentMap.set(content.id, content);
        });
        
        // Create relations map
        const albumContentMap = new Map();
        relations.forEach(relation => {
            if (!albumContentMap.has(relation.album_id)) {
                albumContentMap.set(relation.album_id, []);
            }
            albumContentMap.get(relation.album_id).push({
                contentId: relation.content_id,
                order: relation.order
            });
        });
        
        // Process each album
        for (const album of albums) {
            console.log(`\nProcessing album: ${album.title}`);
            
            const workSlug = slugify(album.title);
            const workDir = path.join(config.outputPath, 'works', workSlug);
            const imagesDir = path.join(workDir, 'images');
            
            createDirectory(workDir);
            createDirectory(imagesDir);
            
            // Get associated images
            const albumImages = [];
            const contentRelations = albumContentMap.get(album.id) || [];
            
            // Sort by order
            contentRelations.sort((a, b) => a.order - b.order);
            
            for (const relation of contentRelations) {
                const content = contentMap.get(relation.contentId);
                if (content && content.filename) {
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
                    } else {
                        console.warn(`Image not found: ${content.filename}`);
                    }
                }
            }
            
            // Extract metadata from description
            let materials = null;
            let dimensions = null;
            let year = null;
            
            if (album.description) {
                // Look for year
                const yearMatch = album.description.match(/\b(20\d{2}|\d{4})\b/);
                if (yearMatch) {
                    year = parseInt(yearMatch[1]);
                }
                
                // Look for materials and dimensions
                const materialMatch = album.description.match(/([A-Za-zäöüÄÖÜß\s,]+)\s*\|\s*(\d+[\d\sx,]+\s*cm)/);
                if (materialMatch) {
                    materials = materialMatch[1].trim();
                    dimensions = materialMatch[2].trim();
                }
            }
            
            // Create markdown file
            const frontMatter = {
                title: album.title,
                slug: workSlug,
                layout: 'work.njk',
                permalink: `/works/${workSlug}/`,
                summary: album.summary || null,
                description: album.description || null,
                materials: materials,
                dimensions: dimensions,
                year: year,
                featured: album.featured === 1 || albumImages.length > 0,
                featured_image: albumImages.length > 0 ? albumImages[0].src : null,
                published_on: timestampToDate(album.published_on),
                created_on: timestampToDate(album.created_on),
                total_count: album.total_count,
                images: albumImages.length > 0 ? albumImages : null
            };
            
            const content = album.description || album.summary || '';
            const markdownPath = path.join(workDir, 'index.md');
            createMarkdownFile(markdownPath, frontMatter, content);
        }
        
        // Process text content (essays, CV, etc.)
        console.log(`\nProcessing ${textContent.length} text content items...`);
        for (const text of textContent) {
            if (text.page_type === 0) { // Essays
                const essaySlug = slugify(text.title);
                const frontMatter = {
                    title: text.title,
                    slug: text.slug,
                    layout: 'base.njk',
                    excerpt: text.excerpt || null,
                    published_on: timestampToDate(text.published_on),
                    created_on: timestampToDate(text.created_on),
                    date: timestampToDate(text.published_on) || timestampToDate(text.created_on)
                };
                
                const essayPath = path.join(config.outputPath, 'essays', `${essaySlug}.md`);
                createMarkdownFile(essayPath, frontMatter, text.content || '');
            } else if (text.page_type === 1) { // Pages like CV
                const frontMatter = {
                    title: text.title,
                    slug: text.slug,
                    layout: 'base.njk',
                    permalink: `/${text.slug}/`
                };
                
                const pagePath = path.join(config.outputPath, text.slug || 'cv', 'index.md');
                createMarkdownFile(pagePath, frontMatter, text.content || '');
            }
        }
        
        console.log('\n=== MIGRATION COMPLETE ===');
        console.log(`✅ Created ${albums.length} work series`);
        console.log(`✅ Processed ${contents.length} images`);
        console.log(`✅ Created ${textContent.length} text pages`);
        
        console.log('\nWork series created:');
        albums.forEach((album, i) => {
            const year = timestampToDate(album.created_on) ? timestampToDate(album.created_on).split('-')[0] : '????';
            console.log(`${(i+1).toString().padStart(2)}. ${album.title} (${year})`);
        });
        
    } catch (error) {
        console.error('Migration error:', error);
    } finally {
        db.close();
    }
}

// Run migration
migrate().catch(console.error);