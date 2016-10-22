'use strict';

const marked = require('marked');
const TextRenderer = require('./marked-text-renderer.js');

const removeMarkdown = marked.setOptions({
  renderer: new TextRenderer,
  gfm: true,
  tables: true,
  breaks: false,
  pedantic: false,
  sanitize: true,
  smartLists: true,
  smartypants: false
});

module.exports = removeMarkdown;
