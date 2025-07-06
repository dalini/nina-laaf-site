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
                if (value.length === 0) return null;
                return `${key}:\n${value.map(item => {
                    if (typeof item === 'object') {
                        return `  - src: "${item.src}"\n    alt: "${item.alt}"\n    caption: "${item.caption || ''}"\n    order: ${item.order}`;
                    }
                    return `  - ${JSON.stringify(item)}`;
                }).join('\n')}`;
            }
            return `${key}: ${JSON.stringify(value)}`;
        })
        .filter(line => line !== null)
        .join('\n');

    const markdown = `---\n${yamlFrontMatter}\n---\n\n${content}`;
    fs.writeFileSync(filePath, markdown, 'utf8');
    console.log(`Created: ${path.basename(filePath)}`);
}

function timestampToDate(timestamp) {
    if (!timestamp || timestamp === 'NULL') return null;
    const ts = parseInt(timestamp);
    if (isNaN(ts) || ts <= 0) return null;
    return new Date(ts * 1000).toISOString().split('T')[0];
}

function extractAllAlbums(sqlContent) {
    // Extract the entire albums INSERT statement
    const albumsRegex = /INSERT INTO `koken_albums`.*?VALUES\s*([\s\S]*?);/i;
    const match = sqlContent.match(albumsRegex);
    
    if (!match) {
        console.error('Could not find albums data in SQL');
        return [];
    }
    
    const valuesString = match[1];
    const albums = [];
    
    // Split on '),(' to get individual album records
    const albumRows = valuesString.split('),\n(');
    
    for (let i = 0; i < albumRows.length; i++) {
        let row = albumRows[i];
        
        // Clean up the row
        if (i === 0) row = row.replace(/^\(/, ''); // Remove leading (
        if (i === albumRows.length - 1) row = row.replace(/\)$/, ''); // Remove trailing )
        
        // Parse the row - this is complex due to embedded quotes and nulls
        const album = parseAlbumRow(row);
        if (album && album.title && album.title !== 'NULL') {
            albums.push(album);
        }
    }
    
    return albums;
}

function parseAlbumRow(row) {
    // This is a simplified parser - in production, you'd want a more robust CSV parser
    const values = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < row.length) {
        const char = row[i];
        
        if (char === "'" && !inQuotes) {
            inQuotes = true;
        } else if (char === "'" && inQuotes && (i + 1 >= row.length || row[i + 1] === ',')) {
            inQuotes = false;
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim() === 'NULL' ? null : current.trim());
            current = '';
            i++;
            continue;
        } else {
            current += char;
        }
        i++;
    }
    
    // Add the last value
    if (current.trim()) {
        values.push(current.trim() === 'NULL' ? null : current.trim());
    }
    
    if (values.length >= 23) {
        return {
            id: parseInt(values[0]),
            title: values[1] ? values[1].replace(/^'|'$/g, '') : null,
            slug: values[2] ? values[2].replace(/^'|'$/g, '') : null,
            summary: values[3] ? values[3].replace(/^'|'$/g, '') : null,
            description: values[4] ? values[4].replace(/^'|'$/g, '') : null,
            listed: parseInt(values[5]) || 0,
            level: parseInt(values[6]) || 0,
            deleted: parseInt(values[9]) || 0,
            featured: parseInt(values[10]) || 0,
            total_count: parseInt(values[13]) || 0,
            published_on: values[15] ? timestampToDate(values[15]) : null,
            created_on: values[16] ? timestampToDate(values[16]) : null,
            visibility: parseInt(values[22]) || 0
        };
    }
    
    return null;
}

// Main migration function
async function migrate() {
    console.log('Starting complete migration...');
    
    // Clean existing content
    const worksDir = path.join(config.outputPath, 'works');
    if (fs.existsSync(worksDir)) {
        fs.rmSync(worksDir, { recursive: true });
    }
    
    // Create output directories
    createDirectory(config.outputPath);
    createDirectory(path.join(config.outputPath, 'works'));
    createDirectory(path.join(config.outputPath, 'essays'));
    createDirectory(path.join(config.outputPath, 'news'));
    createDirectory(path.join(config.outputPath, 'cv'));

    // Read SQL file
    const sqlContent = fs.readFileSync(config.dbPath, 'utf8');
    
    // Extract albums using the new method
    const albums = extractAllAlbums(sqlContent);
    console.log(`Found ${albums.length} albums in database`);
    
    // Filter for published, listed albums
    const publishedAlbums = albums.filter(album => 
        album.deleted === 0 && 
        album.listed === 1 && 
        album.title && 
        album.title.trim() !== ''
    );
    
    console.log(`Found ${publishedAlbums.length} published albums`);
    
    // Parse content data (simplified for now)
    const contentRegex = /INSERT INTO `koken_content`.*?VALUES\s*([\s\S]*?);/i;
    const contentMatch = sqlContent.match(contentRegex);
    const contents = [];
    
    if (contentMatch) {
        // For now, just create empty content - we'll improve this
        console.log('Content data found, processing...');
    }
    
    // Create work pages for each published album
    for (const album of publishedAlbums) {
        const workSlug = slugify(album.title);
        const workDir = path.join(config.outputPath, 'works', workSlug);
        const imagesDir = path.join(workDir, 'images');
        
        createDirectory(workDir);
        createDirectory(imagesDir);

        // Create markdown file with available data
        const frontMatter = {
            title: album.title,
            slug: workSlug,
            layout: 'work.njk',
            permalink: `/works/${workSlug}/`,
            summary: album.summary || null,
            description: album.description || null,
            featured: album.featured === 1,
            published_on: album.published_on,
            created_on: album.created_on,
            total_count: album.total_count
        };

        const content = album.description || album.summary || '';
        const markdownPath = path.join(workDir, 'index.md');
        createMarkdownFile(markdownPath, frontMatter, content);
    }

    console.log('\nMigration completed!');
    console.log(`Created ${publishedAlbums.length} work series`);
    console.log('\nWork series created:');
    publishedAlbums.forEach(album => {
        console.log(`- ${album.title} (${album.slug})`);
    });
}

// Run migration
migrate().catch(console.error);