const fs = require('fs');
const path = require('path');

// Configuration
const config = {
    dbPath: path.join(__dirname, '../current_site/c9_koken_nina_1.sql'),
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
    if (!fs.existsSync(config.originalImagesPath)) {
        return null;
    }
    
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

function extractTable(sqlContent, tableName) {
    const rows = [];
    let searchPos = 0;
    
    // Find ALL INSERT statements for this table
    while (true) {
        const insertStart = sqlContent.indexOf(`INSERT INTO \`${tableName}\``, searchPos);
        if (insertStart === -1) {
            break; // No more INSERT statements for this table
        }
        
        // Find the VALUES keyword for this INSERT
        const valuesStart = sqlContent.indexOf('VALUES', insertStart);
        if (valuesStart === -1) {
            console.log(`No VALUES clause found for table ${tableName} at position ${insertStart}`);
            break;
        }
        
        // Find the end of this INSERT statement
        let insertEnd = valuesStart;
        let nextInsert = sqlContent.indexOf('\nINSERT INTO', valuesStart);
        
        if (nextInsert === -1) {
            // No more INSERT statements, use end of file
            insertEnd = sqlContent.length;
        } else {
            insertEnd = nextInsert;
        }
        
        // Extract the data section for this INSERT
        const insertData = sqlContent.substring(valuesStart + 6, insertEnd); // +6 to skip "VALUES"
        
        // Split by lines and process each row
        const lines = insertData.split('\n');
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('(') && trimmedLine.includes(',')) {
                // Remove the opening ( and closing ),
                const cleanLine = trimmedLine.replace(/^\(/, '').replace(/\),?$/, '');
                
                // Simple CSV-like parsing for SQL values
                const values = [];
                let current = '';
                let inQuotes = false;
                let quoteChar = '';
                
                for (let i = 0; i < cleanLine.length; i++) {
                    const char = cleanLine[i];
                    
                    if ((char === '"' || char === "'") && !inQuotes) {
                        inQuotes = true;
                        quoteChar = char;
                    } else if (char === quoteChar && inQuotes) {
                        // Check if next char is the same (escaped quote)
                        if (cleanLine[i + 1] === quoteChar) {
                            current += char;
                            i++; // Skip the next character
                        } else {
                            inQuotes = false;
                            quoteChar = '';
                        }
                    } else if (char === ',' && !inQuotes) {
                        values.push(current.trim() === 'NULL' ? null : current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                
                // Add the last value
                if (current.trim()) {
                    values.push(current.trim() === 'NULL' ? null : current.trim());
                }
                
                rows.push(values);
            }
        }
        
        // Move search position to after this INSERT statement
        searchPos = insertEnd;
    }
    
    return rows;
}

// Main migration function
async function migrate() {
    console.log('Starting migration with proper album-image relationships...');
    
    // Clean existing content
    const worksDir = path.join(config.outputPath, 'works');
    if (fs.existsSync(worksDir)) {
        fs.rmSync(worksDir, { recursive: true });
    }
    createDirectory(worksDir);
    
    // Read SQL file
    const sqlContent = fs.readFileSync(config.dbPath, 'utf8');
    
    // Extract data from relevant tables
    console.log('Extracting albums...');
    const albumsData = extractTable(sqlContent, 'koken_albums');
    console.log(`Found ${albumsData.length} album records`);
    
    console.log('Extracting content...');
    const contentData = extractTable(sqlContent, 'koken_content');
    console.log(`Found ${contentData.length} content records`);
    
    console.log('Extracting album-content relationships...');
    const relationsData = extractTable(sqlContent, 'koken_join_albums_content');
    console.log(`Found ${relationsData.length} relationship records`);
    
    // Parse albums into objects
    const albums = [];
    for (const row of albumsData) {
        if (row.length >= 23) {
            const album = {
                id: parseInt(row[0]),
                title: row[1],
                slug: row[2],
                summary: row[3],
                description: row[4],
                listed: parseInt(row[5]) || 0,
                deleted: parseInt(row[9]) || 0,
                featured: parseInt(row[10]) || 0,
                total_count: parseInt(row[13]) || 0,
                published_on: timestampToDate(row[15]),
                created_on: timestampToDate(row[16]),
                visibility: parseInt(row[22]) || 0
            };
            
            // Only include published, listed, public albums
            if (album.deleted === 0 && album.listed === 1 && album.visibility === 0 && album.title) {
                albums.push(album);
            }
        }
    }
    
    console.log(`Found ${albums.length} published albums`);
    
    // Parse content into objects
    const contentMap = new Map();
    for (const row of contentData) {
        if (row.length >= 15) {
            const content = {
                id: parseInt(row[0]),
                title: row[1],
                filename: row[4],
                caption: row[5],
                deleted: parseInt(row[9]) || 0
            };
            
            if (content.deleted === 0 && content.filename) {
                contentMap.set(content.id, content);
            }
        }
    }
    
    console.log(`Found ${contentMap.size} content items`);
    
    // Parse relationships
    const albumContentMap = new Map();
    for (const row of relationsData) {
        if (row.length >= 4) {
            const albumId = parseInt(row[1]);
            const contentId = parseInt(row[2]);
            const order = parseInt(row[3]) || 0;
            
            if (!albumContentMap.has(albumId)) {
                albumContentMap.set(albumId, []);
            }
            
            albumContentMap.get(albumId).push({
                contentId: contentId,
                order: order
            });
        }
    }
    
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
        const relations = albumContentMap.get(album.id) || [];
        
        // Sort by order
        relations.sort((a, b) => a.order - b.order);
        
        for (const relation of relations) {
            const content = contentMap.get(relation.contentId);
            if (content && content.filename) {
                const originalPath = findOriginalImage(content.filename);
                if (originalPath) {
                    const ext = path.extname(content.filename);
                    // Use original filename, not title, to avoid duplicates
                    const baseName = content.filename.replace(ext, '');
                    const imageName = `${slugify(baseName)}${ext}`;
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
            published_on: album.published_on,
            created_on: album.created_on,
            total_count: album.total_count,
            images: albumImages.length > 0 ? albumImages : null
        };
        
        const content = album.description || album.summary || '';
        const markdownPath = path.join(workDir, 'index.md');
        createMarkdownFile(markdownPath, frontMatter, content);
    }
    
    console.log('\n=== MIGRATION COMPLETE ===');
    console.log(`✅ Created ${albums.length} work series`);
    console.log(`✅ Processed ${contentMap.size} images`);
    
    console.log('\nWork series created:');
    albums.forEach((album, i) => {
        const year = album.created_on ? album.created_on.split('-')[0] : '????';
        const imageCount = (albumContentMap.get(album.id) || []).length;
        console.log(`${(i+1).toString().padStart(2)}. ${album.title} (${year}) - ${imageCount} images`);
    });
}

// Run migration
migrate().catch(console.error);