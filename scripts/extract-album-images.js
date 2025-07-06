const fs = require('fs');
const path = require('path');

// Configuration
const config = {
    dbPath: path.join(__dirname, '../current_site/c9_koken_nina_1.sql'),
    originalImagesPath: path.join(__dirname, '../current_site/webs/nina-laaf.de/web/koken/storage/originals'),
    outputPath: path.join(__dirname, '../content')
};

// Helper functions
function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function extractTable(sqlContent, tableName) {
    // Find the start of the INSERT statement
    const insertStart = sqlContent.indexOf(`INSERT INTO \`${tableName}\``);
    if (insertStart === -1) {
        console.log(`No INSERT statements found for table ${tableName}`);
        return [];
    }
    
    // Find the VALUES keyword
    const valuesStart = sqlContent.indexOf('VALUES', insertStart);
    if (valuesStart === -1) {
        console.log(`No VALUES clause found for table ${tableName}`);
        return [];
    }
    
    // Find the end of the INSERT statement (next INSERT or end of file)
    let insertEnd = sqlContent.indexOf('\nINSERT INTO', valuesStart);
    if (insertEnd === -1) {
        insertEnd = sqlContent.length;
    }
    
    // Extract the data section
    const insertData = sqlContent.substring(valuesStart + 6, insertEnd); // +6 to skip "VALUES"
    const rows = [];
    
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
    
    return rows;
}

// Main function to extract and display relationships
function extractAlbumImageRelationships() {
    console.log('Extracting album-image relationships from MySQL dump...');
    
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
                visibility: parseInt(row[22]) || 0,
                total_count: parseInt(row[13]) || 0
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
    
    // Display results
    console.log('\n=== ALBUM-IMAGE RELATIONSHIPS ===\n');
    
    for (const album of albums.slice(0, 10)) { // Show first 10 albums
        console.log(`Album: ${album.title} (ID: ${album.id})`);
        
        const relations = albumContentMap.get(album.id) || [];
        relations.sort((a, b) => a.order - b.order);
        
        console.log(`  Images (${relations.length}):`);
        for (const relation of relations) {
            const content = contentMap.get(relation.contentId);
            if (content) {
                console.log(`    ${relation.order}. ${content.filename} - "${content.title || 'No title'}"`);
            } else {
                console.log(`    ${relation.order}. [Missing content ID ${relation.contentId}]`);
            }
        }
        console.log('');
    }
    
    return { albums, contentMap, albumContentMap };
}

// Run the extraction
extractAlbumImageRelationships();