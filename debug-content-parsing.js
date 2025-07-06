const fs = require('fs');
const path = require('path');

const config = {
    dbPath: path.join(__dirname, './current_site/c9_koken_nina_1.sql')
};

function extractTable(sqlContent, tableName) {
    console.log(`Extracting table: ${tableName}`);
    
    // Find the start of the INSERT statement
    const insertStart = sqlContent.indexOf(`INSERT INTO \`${tableName}\``);
    if (insertStart === -1) {
        console.log(`No INSERT statements found for table ${tableName}`);
        return [];
    }
    
    console.log(`Found INSERT statement at position: ${insertStart}`);
    
    // Find the VALUES keyword
    const valuesStart = sqlContent.indexOf('VALUES', insertStart);
    if (valuesStart === -1) {
        console.log(`No VALUES clause found for table ${tableName}`);
        return [];
    }
    
    console.log(`Found VALUES at position: ${valuesStart}`);
    
    // Find the end of the INSERT statement (next INSERT or end of file)
    let insertEnd = sqlContent.indexOf('\nINSERT INTO', valuesStart);
    if (insertEnd === -1) {
        insertEnd = sqlContent.length;
    }
    
    console.log(`Insert ends at position: ${insertEnd}`);
    
    // Extract the data section
    const insertData = sqlContent.substring(valuesStart + 6, insertEnd); // +6 to skip "VALUES"
    const rows = [];
    
    // Split by lines and process each row
    const lines = insertData.split('\n');
    console.log(`Found ${lines.length} lines to process`);
    
    let foundContent223 = false;
    let foundContent224 = false;
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        const trimmedLine = line.trim();
        
        // Check if this line contains our target content
        if (trimmedLine.includes('223,') || trimmedLine.includes('224,')) {
            console.log(`Line ${lineNum}: ${trimmedLine}`);
        }
        
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
            
            // Check if this is one of our target rows
            if (values[0] === '223') {
                foundContent223 = true;
                console.log('Found content 223:', values);
                console.log('Length:', values.length);
            }
            if (values[0] === '224') {
                foundContent224 = true;
                console.log('Found content 224:', values);
                console.log('Length:', values.length);
            }
            
            rows.push(values);
        }
    }
    
    console.log(`Parsed ${rows.length} rows total`);
    console.log(`Found content 223: ${foundContent223}`);
    console.log(`Found content 224: ${foundContent224}`);
    
    return rows;
}

// Read SQL file
const sqlContent = fs.readFileSync(config.dbPath, 'utf8');

// Extract content table
const contentData = extractTable(sqlContent, 'koken_content');