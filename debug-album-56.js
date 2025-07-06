const fs = require('fs');
const path = require('path');

// Configuration
const config = {
    dbPath: path.join(__dirname, './current_site/c9_koken_nina_1.sql'),
    originalImagesPath: path.join(__dirname, './current_site/webs/nina-laaf.de/web/koken/storage/originals'),
    customImagesPath: path.join(__dirname, './current_site/webs/nina-laaf.de/web/koken/storage/custom'),
    outputPath: path.join(__dirname, './content')
};

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

// Read SQL file
const sqlContent = fs.readFileSync(config.dbPath, 'utf8');

// Extract album
console.log('=== ALBUM 56 DEBUG ===');
const albumsData = extractTable(sqlContent, 'koken_albums');
const album56 = albumsData.find(row => parseInt(row[0]) === 56);
console.log('Album 56 data:', album56);

// Extract content
const contentData = extractTable(sqlContent, 'koken_content');
const content223 = contentData.find(row => parseInt(row[0]) === 223);
const content224 = contentData.find(row => parseInt(row[0]) === 224);
console.log('Content 223:', content223);
console.log('Content 224:', content224);

// Extract relationships
const relationsData = extractTable(sqlContent, 'koken_join_albums_content');
const album56Relations = relationsData.filter(row => parseInt(row[1]) === 56);
console.log('Album 56 relationships:', album56Relations);

// Parse content into objects like the migration script does
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

console.log('Content 223 in map:', contentMap.get(223));
console.log('Content 224 in map:', contentMap.get(224));

// Parse relationships like the migration script does
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

const relations56 = albumContentMap.get(56) || [];
console.log('Parsed relationships for album 56:', relations56);

// Sort by order like the migration script
relations56.sort((a, b) => a.order - b.order);
console.log('Sorted relationships for album 56:', relations56);

// Check if content exists for each relation
for (const relation of relations56) {
    const content = contentMap.get(relation.contentId);
    console.log(`Relation ${relation.contentId} (order ${relation.order}):`, content);
}