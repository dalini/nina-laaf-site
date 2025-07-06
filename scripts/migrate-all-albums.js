const fs = require('fs');
const path = require('path');

// Configuration
const config = {
    dbPath: path.join(__dirname, '../current_site/c9_koken_nina_1.sql'),
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
    if (!timestamp || timestamp === 'NULL') return null;
    const ts = parseInt(timestamp);
    if (isNaN(ts) || ts <= 0) return null;
    return new Date(ts * 1000).toISOString().split('T')[0];
}

function parseAlbumLine(line) {
    // Remove leading ( and trailing ),
    line = line.replace(/^\(/, '').replace(/\),?$/, '');
    
    // Split by comma but respect quoted strings
    const parts = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === "'" && !inQuotes) {
            inQuotes = true;
            // Don't include the quote in the value
        } else if (char === "'" && inQuotes && (nextChar === ',' || nextChar === undefined)) {
            inQuotes = false;
            // Don't include the quote in the value
        } else if (char === ',' && !inQuotes) {
            parts.push(current.trim() === 'NULL' ? null : current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    // Add the last part
    if (current.trim()) {
        parts.push(current.trim() === 'NULL' ? null : current.trim());
    }
    
    if (parts.length >= 20) {
        return {
            id: parseInt(parts[0]),
            title: parts[1],
            slug: parts[2],
            summary: parts[3],
            description: parts[4],
            listed: parseInt(parts[5]) || 0,
            level: parseInt(parts[6]) || 0,
            deleted: parseInt(parts[9]) || 0,
            featured: parseInt(parts[10]) || 0,
            total_count: parseInt(parts[13]) || 0,
            published_on: parts[15] ? timestampToDate(parts[15]) : null,
            created_on: parts[16] ? timestampToDate(parts[16]) : null,
            visibility: parts.length > 22 ? parseInt(parts[22]) || 0 : 0
        };
    }
    
    return null;
}

// Main migration function
async function migrate() {
    console.log('Starting full album migration...');
    
    // Clean existing content
    const worksDir = path.join(config.outputPath, 'works');
    if (fs.existsSync(worksDir)) {
        fs.rmSync(worksDir, { recursive: true });
    }
    createDirectory(worksDir);

    // Read SQL file
    const sqlContent = fs.readFileSync(config.dbPath, 'utf8');
    
    // Extract all album lines from the albums INSERT statement
    const albumLines = [];
    const lines = sqlContent.split('\n');
    let inAlbumsInsert = false;
    
    for (const line of lines) {
        if (line.includes('INSERT INTO `koken_albums`')) {
            inAlbumsInsert = true;
            continue;
        }
        
        if (inAlbumsInsert) {
            if (line.trim().startsWith('(') && line.includes("'")) {
                albumLines.push(line.trim());
            }
            
            // Stop when we hit the next table or end of INSERT
            if (line.includes('INSERT INTO') && !line.includes('koken_albums')) {
                break;
            }
        }
    }
    
    console.log(`Found ${albumLines.length} album lines to process`);
    
    // Parse each album line
    const albums = [];
    for (const line of albumLines) {
        const album = parseAlbumLine(line);
        if (album && album.title) {
            albums.push(album);
        }
    }
    
    console.log(`Parsed ${albums.length} albums from database`);
    
    // Filter for published, listed albums
    const publishedAlbums = albums.filter(album => 
        album.deleted === 0 && 
        album.listed === 1 && 
        album.title && 
        album.title.trim() !== '' &&
        album.visibility === 0  // public visibility
    );
    
    console.log(`Found ${publishedAlbums.length} published, public albums`);
    
    // Create work pages for each published album
    for (const album of publishedAlbums) {
        const workSlug = slugify(album.title);
        const workDir = path.join(config.outputPath, 'works', workSlug);
        const imagesDir = path.join(workDir, 'images');
        
        createDirectory(workDir);
        createDirectory(imagesDir);

        // Extract year from description or title
        let year = null;
        const yearMatch = (album.description || album.title || '').match(/\b(20\d{2}|\d{4})\b/);
        if (yearMatch) {
            year = parseInt(yearMatch[1]);
        }

        // Extract materials and dimensions from description
        let materials = null;
        let dimensions = null;
        if (album.description) {
            // Look for material patterns
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
            featured: album.featured === 1,
            published_on: album.published_on,
            created_on: album.created_on,
            total_count: album.total_count
        };

        const content = album.description || album.summary || '';
        const markdownPath = path.join(workDir, 'index.md');
        createMarkdownFile(markdownPath, frontMatter, content);
    }

    console.log('\n=== MIGRATION COMPLETE ===');
    console.log(`Created ${publishedAlbums.length} work series`);
    console.log('\nWork series created:');
    publishedAlbums
        .sort((a, b) => (b.created_on || '').localeCompare(a.created_on || ''))
        .forEach((album, i) => {
            const year = album.created_on ? album.created_on.split('-')[0] : '????';
            console.log(`${(i+1).toString().padStart(2)}. ${album.title} (${year})`);
        });
}

// Run migration
migrate().catch(console.error);