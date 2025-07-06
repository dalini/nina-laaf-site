const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

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
        console.log(`Copied: ${sourcePath} -> ${destPath}`);
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
            }
        }
    }
    return null;
}

function createMarkdownFile(filePath, frontMatter, content = '') {
    const yamlFrontMatter = Object.entries(frontMatter)
        .map(([key, value]) => {
            if (typeof value === 'string' && value.includes('\n')) {
                return `${key}: |\n  ${value.replace(/\n/g, '\n  ')}`;
            }
            return `${key}: ${JSON.stringify(value)}`;
        })
        .join('\n');

    const markdown = `---\n${yamlFrontMatter}\n---\n\n${content}`;
    fs.writeFileSync(filePath, markdown, 'utf8');
    console.log(`Created: ${filePath}`);
}

// Main migration function
async function migrate() {
    console.log('Starting migration...');
    
    // Create output directories
    createDirectory(config.outputPath);
    createDirectory(path.join(config.outputPath, 'works'));
    createDirectory(path.join(config.outputPath, 'essays'));
    createDirectory(path.join(config.outputPath, 'news'));
    createDirectory(path.join(config.outputPath, 'cv'));

    // Since we have an SQL dump, we need to process it differently
    // Let's read and parse the SQL file to extract data
    const sqlContent = fs.readFileSync(config.dbPath, 'utf8');
    
    // Extract INSERT statements for key tables
    const extractInserts = (tableName) => {
        const regex = new RegExp(`INSERT INTO \`${tableName}\` .*?VALUES\\s*\\((.*?)\\);`, 'gims');
        const matches = [];
        let match;
        while ((match = regex.exec(sqlContent)) !== null) {
            matches.push(match[1]);
        }
        return matches;
    };

    // Parse albums
    const albumInserts = extractInserts('koken_albums');
    const albums = [];
    
    albumInserts.forEach(insert => {
        // Parse INSERT values - this is a simplified parser
        const values = insert.split(',').map(v => v.trim().replace(/^'|'$/g, ''));
        if (values.length >= 6) {
            albums.push({
                id: values[0],
                title: values[1],
                slug: values[2],
                summary: values[3],
                description: values[4],
                visibility: values[5]
            });
        }
    });

    // Parse content (images)
    const contentInserts = extractInserts('koken_content');
    const contents = [];
    
    contentInserts.forEach(insert => {
        const values = insert.split(',').map(v => v.trim().replace(/^'|'$/g, ''));
        if (values.length >= 8) {
            contents.push({
                id: values[0],
                title: values[1],
                slug: values[2],
                filename: values[3],
                caption: values[4],
                uploaded_on: values[5],
                captured_on: values[6],
                visibility: values[7]
            });
        }
    });

    // Parse album-content relationships
    const albumContentInserts = extractInserts('koken_join_albums_content');
    const albumContentMap = new Map();
    
    albumContentInserts.forEach(insert => {
        const values = insert.split(',').map(v => v.trim());
        const albumId = values[0];
        const contentId = values[1];
        
        if (!albumContentMap.has(albumId)) {
            albumContentMap.set(albumId, []);
        }
        albumContentMap.get(albumId).push(contentId);
    });

    // Create work pages for each album
    for (const album of albums) {
        if (album.title && album.title !== 'NULL') {
            const workSlug = slugify(album.title);
            const workDir = path.join(config.outputPath, 'works', workSlug);
            const imagesDir = path.join(workDir, 'images');
            
            createDirectory(workDir);
            createDirectory(imagesDir);

            // Get associated content/images
            const albumImages = [];
            const contentIds = albumContentMap.get(album.id) || [];
            
            for (const contentId of contentIds) {
                const content = contents.find(c => c.id === contentId);
                if (content && content.filename && content.filename !== 'NULL') {
                    const originalPath = findOriginalImage(content.filename);
                    if (originalPath) {
                        const ext = path.extname(content.filename);
                        const imageName = `${slugify(content.title || content.filename)}${ext}`;
                        const destPath = path.join(imagesDir, imageName);
                        
                        if (copyImage(originalPath, destPath)) {
                            albumImages.push({
                                src: `images/${imageName}`,
                                alt: content.title || content.caption || album.title,
                                caption: content.caption && content.caption !== 'NULL' ? content.caption : null
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
                summary: album.summary && album.summary !== 'NULL' ? album.summary : null,
                featured: albumImages.length > 0,
                featured_image: albumImages.length > 0 ? albumImages[0].src : null,
                images: albumImages
            };

            const content = album.description && album.description !== 'NULL' ? album.description : '';
            const markdownPath = path.join(workDir, 'index.md');
            createMarkdownFile(markdownPath, frontMatter, content);
        }
    }

    // Parse and create essays/text content
    const textInserts = extractInserts('koken_text');
    
    textInserts.forEach(insert => {
        const values = insert.split(',').map(v => v.trim().replace(/^'|'$/g, ''));
        if (values.length >= 6 && values[1] && values[1] !== 'NULL') {
            const title = values[1];
            const slug = values[2];
            const content = values[3];
            const pageType = values[4]; // 0=essay, 1=page
            const published = values[5];

            if (pageType === '0') { // Essay
                const frontMatter = {
                    title: title,
                    slug: slug,
                    layout: 'base.njk',
                    date: new Date().toISOString().split('T')[0]
                };

                const essayPath = path.join(config.outputPath, 'essays', `${slugify(title)}.md`);
                createMarkdownFile(essayPath, frontMatter, content);
            } else if (pageType === '1') { // Page (like CV)
                const frontMatter = {
                    title: title,
                    slug: slug,
                    layout: 'base.njk'
                };

                const pagePath = path.join(config.outputPath, 'cv', 'index.md');
                createMarkdownFile(pagePath, frontMatter, content);
            }
        }
    });

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

    console.log('Migration completed successfully!');
    console.log(`Created content in: ${config.outputPath}`);
    console.log('Next steps:');
    console.log('1. Run: npm install');
    console.log('2. Run: npm start');
    console.log('3. Visit: http://localhost:8080');
}

// Run migration
migrate().catch(console.error);