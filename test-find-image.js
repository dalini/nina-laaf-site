const fs = require('fs');
const path = require('path');

const originalImagesPath = '/Users/ives.laaf/dev/nina/current_site/webs/nina-laaf.de/web/koken/storage/originals';

function findOriginalImage(filename) {
    console.log('Looking for:', filename);
    
    if (!fs.existsSync(originalImagesPath)) {
        console.log('Original images path does not exist');
        return null;
    }
    
    const hexDirs = fs.readdirSync(originalImagesPath);
    console.log('Found hex dirs:', hexDirs.length);
    
    for (const dir1 of hexDirs) {
        const subPath = path.join(originalImagesPath, dir1);
        if (fs.statSync(subPath).isDirectory()) {
            const subDirs = fs.readdirSync(subPath);
            for (const dir2 of subDirs) {
                const imagePath = path.join(subPath, dir2, filename);
                if (fs.existsSync(imagePath)) {
                    console.log('Found:', imagePath);
                    return imagePath;
                }
                // Also check for .1600.jpg versions
                const resizedPath = path.join(subPath, dir2, filename.replace(/(\.[^.]+)$/, '.1600$1'));
                if (fs.existsSync(resizedPath)) {
                    console.log('Found resized:', resizedPath);
                    return resizedPath;
                }
            }
        }
    }
    console.log('Not found');
    return null;
}

console.log('=== Testing findOriginalImage ===');
findOriginalImage('die-wilde-Fleurie-Boden-Detail.jpeg');
findOriginalImage('die-wilde-Fleurie-Nina-Laaf-2022.jpg');