const Image = require("@11ty/eleventy-img");
const path = require("path");

module.exports = function(eleventyConfig) {
  // Copy static assets
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("content/**/images");
  
  // Watch for changes
  eleventyConfig.addWatchTarget("src/css/");
  eleventyConfig.addWatchTarget("content/");
  
  // Image shortcode for responsive images
  eleventyConfig.addShortcode("image", async function(src, alt, sizes = "100vw") {
    const metadata = await Image(src, {
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
      input: "src",
      includes: "_includes",
      layouts: "_layouts",
      data: "_data",
      output: "_site"
    },
    templateFormats: ["md", "njk", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk"
  };
};