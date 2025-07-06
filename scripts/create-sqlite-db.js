const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Configuration
const config = {
    mysqlDumpPath: path.join(__dirname, '../current_site/c9_koken_nina_1.sql'),
    sqliteDbPath: path.join(__dirname, '../current_site/koken.sqlite')
};

function convertMySQLToSQLite() {
    console.log('Converting MySQL dump to SQLite...');
    
    const mysqlContent = fs.readFileSync(config.mysqlDumpPath, 'utf8');
    
    // Basic conversion - remove MySQL-specific syntax
    let sqliteContent = mysqlContent
        // Remove MySQL-specific commands
        .replace(/SET SQL_MODE.*?;/g, '')
        .replace(/START TRANSACTION;/g, '')
        .replace(/SET time_zone.*?;/g, '')
        .replace(/\/\*![0-9]+.*?\*\//g, '')
        .replace(/ENGINE=MyISAM.*?;/g, ';')
        .replace(/AUTO_INCREMENT=[0-9]+/g, '')
        .replace(/DEFAULT CHARSET=.*?;/g, ';')
        .replace(/COLLATE=.*?;/g, ';')
        // Fix data types
        .replace(/int\([0-9]+\)/g, 'INTEGER')
        .replace(/varchar\([0-9]+\)/g, 'TEXT')
        .replace(/longtext/g, 'TEXT')
        .replace(/text/g, 'TEXT')
        .replace(/tinyint\(1\)/g, 'INTEGER')
        .replace(/char\([0-9]+\)/g, 'TEXT')
        // Remove backticks
        .replace(/`/g, '')
        // Fix NULL handling
        .replace(/'NULL'/g, 'NULL')
        .replace(/DEFAULT NULL/g, '')
        // Clean up
        .replace(/\n\n+/g, '\n\n');
    
    // Write converted SQL
    const convertedPath = path.join(__dirname, '../current_site/koken_converted.sql');
    fs.writeFileSync(convertedPath, sqliteContent);
    
    console.log('MySQL dump converted to SQLite format');
    return convertedPath;
}

function createSQLiteDatabase() {
    return new Promise((resolve, reject) => {
        console.log('Creating SQLite database...');
        
        // Remove existing database
        if (fs.existsSync(config.sqliteDbPath)) {
            fs.unlinkSync(config.sqliteDbPath);
        }
        
        const db = new sqlite3.Database(config.sqliteDbPath, (err) => {
            if (err) {
                reject(err);
                return;
            }
            
            console.log('SQLite database created');
            
            // Convert MySQL dump
            const convertedSqlPath = convertMySQLToSQLite();
            const sqlContent = fs.readFileSync(convertedSqlPath, 'utf8');
            
            // Split into individual statements
            const statements = sqlContent
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt && !stmt.startsWith('--') && !stmt.startsWith('/*'));
            
            console.log(`Executing ${statements.length} SQL statements...`);
            
            // Execute statements sequentially
            let completed = 0;
            const executeNext = () => {
                if (completed >= statements.length) {
                    console.log('Database setup complete!');
                    db.close();
                    resolve(config.sqliteDbPath);
                    return;
                }
                
                const statement = statements[completed];
                if (statement) {
                    db.exec(statement, (err) => {
                        if (err && !err.message.includes('already exists')) {
                            console.warn(`Warning: ${err.message}`);
                        }
                        completed++;
                        if (completed % 50 === 0) {
                            console.log(`Progress: ${completed}/${statements.length} statements executed`);
                        }
                        executeNext();
                    });
                } else {
                    completed++;
                    executeNext();
                }
            };
            
            executeNext();
        });
    });
}

// Main function
async function main() {
    try {
        await createSQLiteDatabase();
        console.log('SQLite database ready for querying!');
        console.log(`Database location: ${config.sqliteDbPath}`);
    } catch (error) {
        console.error('Error creating database:', error);
    }
}

main();