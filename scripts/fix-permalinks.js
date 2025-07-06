const fs = require('fs');
const path = require('path');

const worksDir = path.join(__dirname, '../content/works');
const workDirs = fs.readdirSync(worksDir);

for (const workDir of workDirs) {
    const workPath = path.join(worksDir, workDir);
    const indexPath = path.join(workPath, 'index.md');
    
    if (fs.existsSync(indexPath)) {
        let content = fs.readFileSync(indexPath, 'utf8');
        
        // Add permalink if not present
        if (!content.includes('permalink:')) {
            content = content.replace(
                /layout: "work\.njk"/,
                `layout: "work.njk"\npermalink: "/works/{{ slug }}/"`
            );
        }
        
        // Fix featured_image path
        content = content.replace(
            /featured_image: "images\/([^"]+)"/,
            `featured_image: "/works/${workDir}/$1"`
        );
        
        // Fix images array paths
        content = content.replace(
            /"src":"images\/([^"]+)"/g,
            `"src":"/works/${workDir}/$1"`
        );
        
        fs.writeFileSync(indexPath, content);
        console.log(`Fixed: ${workDir}`);
    }
}

console.log('All work pages fixed!');