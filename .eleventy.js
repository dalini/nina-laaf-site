const Image = require("@11ty/eleventy-img");
const path = require("path");

module.exports = function(eleventyConfig) {
  // Copy static assets
  eleventyConfig.addPassthroughCopy({"src/css": "css"});
  eleventyConfig.addPassthroughCopy({"src/js": "js"});
  
  // Copy work images to proper locations
  eleventyConfig.addPassthroughCopy({"content/works/lackierung-faltung-crash/images": "works/lackierung-faltung-crash"});
  eleventyConfig.addPassthroughCopy({"content/works/raumforderung/images": "works/raumforderung"});
  eleventyConfig.addPassthroughCopy({"content/works/coc-n/images": "works/coc-n"});
  eleventyConfig.addPassthroughCopy({"content/works/kristall/images": "works/kristall"});
  eleventyConfig.addPassthroughCopy({"content/works/lachperformance/images": "works/lachperformance"});
  eleventyConfig.addPassthroughCopy({"content/works/s-0-000975482-x-l1-08-x-m0-46/images": "works/s-0-000975482-x-l1-08-x-m0-46"});
  
  // Watch for changes
  eleventyConfig.addWatchTarget("src/css/");
  eleventyConfig.addWatchTarget("content/");
  
  // Image shortcode for responsive images
  eleventyConfig.addShortcode("image", async function(src, alt, sizes = "100vw") {
    // Handle relative paths from content directories
    let imagePath = src;
    if (!path.isAbsolute(src)) {
      // If it's a relative path, resolve it from the current page directory
      imagePath = path.resolve(this.page.inputPath ? path.dirname(this.page.inputPath) : ".", src);
    }
    
    const metadata = await Image(imagePath, {
      widths: [400, 800, 1200, 1600],
      formats: ["webp", "jpeg"],
      outputDir: "_site/images/",
      urlPath: "/images/",
      filenameFormat: function (id, src, width, format, options) {
        const extension = path.extname(src);
        const name = path.basename(src, extension);
        return `${name}-${width}w.${format}`;
      }
    });

    const imageAttributes = {
      alt,
      sizes,
      loading: "lazy",
      decoding: "async",
    };

    return Image.generateHTML(metadata, imageAttributes);
  });
  
  // Collections
  eleventyConfig.addCollection("works", function(collection) {
    return collection.getFilteredByGlob("content/works/*/index.md").sort((a, b) => {
      return (b.data.year || 0) - (a.data.year || 0);
    });
  });
  
  eleventyConfig.addCollection("essays", function(collection) {
    return collection.getFilteredByGlob("content/essays/*.md").sort((a, b) => {
      return new Date(b.data.date) - new Date(a.data.date);
    });
  });
  
  eleventyConfig.addCollection("news", function(collection) {
    return collection.getFilteredByGlob("content/news/*.md").sort((a, b) => {
      return new Date(b.data.date) - new Date(a.data.date);
    });
  });
  
  // Filters
  eleventyConfig.addFilter("year", function(date) {
    return new Date(date).getFullYear();
  });
  
  return {
    dir: {
      input: ".",
      includes: "src/_includes",
      layouts: "src/_layouts",
      data: "src/_data",
      output: "_site"
    },
    templateFormats: ["md", "njk", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk"
  };
};