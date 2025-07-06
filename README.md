# Nina Laaf Portfolio

A modern, responsive portfolio website for sculptor Nina Laaf, built with 11ty (Eleventy) and migrated from Koken CMS.

## Features

- 📱 **Responsive Design** - Works perfectly on desktop and mobile
- 🎨 **Modern Layout** - Clean, contemporary design showcasing artwork
- 📝 **Easy Content Management** - Simple markdown files and folder structure
- 🖼️ **Optimized Images** - Automatic responsive image generation
- 🚀 **Fast Performance** - Static site generation for optimal speed
- 🔧 **GitHub Integration** - Version controlled and deployable

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build

# Run migration (if needed)
npm run migrate
```

## Content Structure

```
content/
├── works/           # Artwork series
│   ├── series-1/
│   │   ├── index.md
│   │   └── images/
├── essays/          # Articles and essays
├── news/           # News and updates
└── cv/             # CV and about information
```

## Adding New Content

### New Artwork Series

1. Create a new folder in `content/works/`
2. Add `index.md` with frontmatter:

```markdown
---
title: "Artwork Title"
year: 2023
materials: "Steel, Paint"
dimensions: "200 x 150 x 100 cm"
featured: true
layout: work.njk
images:
  - src: "images/photo1.jpg"
    alt: "Description"
  - src: "images/photo2.jpg"
    alt: "Description"
---

Description of the artwork series...
```

3. Add images to the `images/` folder

### New Essays

Create a new `.md` file in `content/essays/`:

```markdown
---
title: "Essay Title"
date: 2023-12-01
layout: base.njk
---

Essay content here...
```

## Deployment

The site can be deployed to:
- GitHub Pages
- Netlify
- Vercel
- Any static hosting service

## Technical Details

- **Framework**: 11ty (Eleventy)
- **Templating**: Nunjucks
- **CSS**: Custom responsive design
- **Images**: Automated optimization with `@11ty/eleventy-img`
- **Content**: Markdown with YAML frontmatter

## Migration Notes

The migration script converts data from the original Koken CMS:
- Albums → Work series
- Content → Images and metadata
- Text → Essays and pages
- Preserves all original images and metadata

## Development

```bash
# Start with live reload
npm start

# Clean build directory
npm run clean

# Build production site
npm run build
```

Visit `http://localhost:8080` to see the site locally.