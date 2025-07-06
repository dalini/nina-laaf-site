const fs = require('fs');
const path = require('path');

// Configuration
const config = {
    dbPath: path.join(__dirname, '../current_site/c9_koken_nina_1.sql'),
    outputPath: path.join(__dirname, '../src')
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
    console.log(`Created: ${path.basename(filePath)}`);
}

function timestampToDate(timestamp) {
    if (!timestamp) return null;
    const ts = parseInt(timestamp);
    if (isNaN(ts) || ts <= 0) return null;
    return new Date(ts * 1000).toISOString().split('T')[0];
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

function cleanHtmlContent(htmlContent) {
    if (!htmlContent) return '';
    
    // Remove Koken-specific shortcodes but preserve the content intent
    let cleaned = htmlContent
        // Remove or simplify Koken photo shortcodes
        .replace(/\[koken_photo[^\]]*\]/g, '')
        // Convert common HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#8211;/g, '–')
        .replace(/&#8212;/g, '—')
        .replace(/&hellip;/g, '…')
        // Clean up multiple spaces and line breaks
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
    
    return cleaned;
}

// Main migration function
async function migrateTextContent() {
    console.log('Starting text content migration...');
    
    // Read SQL file
    const sqlContent = fs.readFileSync(config.dbPath, 'utf8');
    
    // Extract text content
    console.log('Extracting text content...');
    const textData = extractTable(sqlContent, 'koken_text');
    console.log(`Found ${textData.length} text content records`);
    
    // Debug: show first few rows
    for (let i = 0; i < Math.min(textData.length, 3); i++) {
        console.log(`Row ${i} length: ${textData[i].length}`);
        console.log(`  ID: ${textData[i][0]}, Title: ${textData[i][1]}, Slug: ${textData[i][3]}`);
        if (textData[i].length >= 19) {
            console.log(`  Published: ${textData[i][12]}, Page Type: ${textData[i][13]}`);
        } else if (textData[i].length >= 13) {
            console.log(`  Published: ${textData[i][12]}, Page Type: ${textData[i][13] || 'undefined'}`);
        }
    }
    
    // Parse text content into objects
    const textItems = [];
    for (const row of textData) {
        if (row.length >= 12) { // Reduced minimum length requirement
            const textItem = {
                id: parseInt(row[0]),
                title: row[1],
                slug: row[3],
                content: cleanHtmlContent(row[9] || ''),
                draft: cleanHtmlContent(row[10] || ''),
                excerpt: row[11] || null,
                published: parseInt(row[12]) || 0,
                page_type: parseInt(row[13]) || 0,
                created_on: timestampToDate(row[15]),
                modified_on: timestampToDate(row[16])
            };
            
            console.log(`Parsed: ${textItem.title}, published: ${textItem.published}, page_type: ${textItem.page_type}, slug: ${textItem.slug}`);
            
            // Include content regardless of published status for now
            if (textItem.title) {
                textItems.push(textItem);
            }
        } else {
            console.log(`Row too short: ${row.length} columns`);
        }
    }
    
    console.log(`Found ${textItems.length} published text items`);
    
    // Create necessary directories
    createDirectory(path.join(config.outputPath, 'essays'));
    createDirectory(path.join(config.outputPath, 'news'));
    createDirectory(config.outputPath);
    
    // Process each text item
    for (const item of textItems) {
        console.log(`\nProcessing: ${item.title}`);
        
        // Determine content type and location based on title/slug
        if (item.slug === 'cv' || item.title.toLowerCase().includes('cv') || item.title.toLowerCase().includes('lebenslauf')) {
            // CV page
            const frontMatter = {
                title: 'CV',
                layout: 'base.njk',
                permalink: '/cv/',
                date: item.created_on || item.modified_on
            };
            
            const cvPath = path.join(config.outputPath, 'cv.md');
            createMarkdownFile(cvPath, frontMatter, item.content);
            
        } else if (item.slug === 'kontakt-contact' || item.title.toLowerCase().includes('kontakt') || item.title.toLowerCase().includes('contact')) {
            // Contact page
            const frontMatter = {
                title: 'Contact',
                layout: 'base.njk',
                permalink: '/contact/',
                date: item.created_on || item.modified_on
            };
            
            const contactPath = path.join(config.outputPath, 'contact.md');
            createMarkdownFile(contactPath, frontMatter, item.content);
            
        } else if (item.slug === 'news-aktuelles' || item.title.toLowerCase().includes('news') || item.title.toLowerCase().includes('aktuelles') || item.title.toLowerCase().includes('ausstellungen')) {
            // News/Exhibitions page
            const frontMatter = {
                title: 'News & Exhibitions',
                layout: 'base.njk',
                permalink: '/news/',
                date: item.created_on || item.modified_on
            };
            
            const newsPath = path.join(config.outputPath, 'news.md');
            createMarkdownFile(newsPath, frontMatter, item.content);
            
        } else {
            // Essays or other content
            const essaySlug = slugify(item.title);
            const frontMatter = {
                title: item.title,
                slug: essaySlug,
                layout: 'base.njk',
                permalink: `/essays/${essaySlug}/`,
                excerpt: item.excerpt || null,
                date: item.created_on || item.modified_on,
                tags: ['essays']
            };
            
            const essayPath = path.join(config.outputPath, 'essays', `${essaySlug}.md`);
            createMarkdownFile(essayPath, frontMatter, item.content);
        }
    }
    
    console.log('\n=== TEXT CONTENT MIGRATION COMPLETE ===');
    console.log(`✅ Created ${textItems.length} pages`);
    
    console.log('\nPages created:');
    textItems.forEach((item, i) => {
        const type = item.slug === 'cv' ? 'CV' : 
                    item.slug === 'kontakt-contact' ? 'Contact' :
                    item.slug === 'news-aktuelles' ? 'News' : 'Essay';
        console.log(`${(i+1).toString().padStart(2)}. ${item.title} (${type})`);
    });
}

// Run migration
migrateTextContent().catch(console.error);