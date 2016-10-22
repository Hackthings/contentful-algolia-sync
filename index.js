'use strict';

const algoliasearch = require('algoliasearch');
const contentful = require('contentful');
const parameterize = require('parameterize');
const fs = require('fs');
const removeMd = require('./remove-markdown.js');
const _ = require('lodash');

var algoliaClient = algoliasearch('VMBUE2UXNH', '7e249f8e0a284bde3b20704dbde8da54');
var index = algoliaClient.initIndex('dev_marketing_blog');

var contentfulClient = contentful.createClient({
  space: '256tjdsmm689',
  accessToken: 'c5a29ae189c09a32d1db14ccf66682a4e3dd00e225150169dbaa36c0c3e4de2e'
});

if (fs.existsSync('./token')) {
  let previousToken = fs.readFileSync('./token', 'utf-8');
  if (previousToken.length > 3) {
    doSync(previousToken);
  } else {
    doClearAndSync();
  }
} else {
  doClearAndSync();
}

function doClearAndSync() {
  console.log('No sync token found. Clearing Algolia index.');
  index.clearIndex().then(function() {
    doSync();
  }, console.error);
}

const CT_BLOG_POST = '5fhzMTnxFeSCwCSWaAIAak';
const CT_FAQ_CATEGORY = '61wR4AwndKq6iiAsq4u0Uo';
const CT_FAQ_ENTRY = '7pEyLCDai4A4CGUsYCKGqs';

function doSync(nextSyncToken) {
  var options = {};
  const INITIAL_SYNC = !nextSyncToken;
  if (INITIAL_SYNC) {
    console.log('Performing initial sync');
    options = {initial: true};
  } else {
    options = {nextSyncToken: nextSyncToken};
  }

  console.log('Starting Contentful sync.');
  contentfulClient.sync(options)
    .then(function(response) {
      console.log('Contentful sync response received');
      var newEntries = response.entries;

      if (!INITIAL_SYNC) {
        var deleteObjectsOperation = deleteEntriesFromIndex(response.deletedEntries, index);
      }

    //  var newBlogObjects = newEntries.filter(filterBlogEntry).map(formatBlogEntry);
      var newFaqObjects = _.flatten(newEntries.filter(filterFaqEntry).map(formatFaqEntry));

   //   var indexObjects = newBlogObjects.concat(newFaqObjects);
      var indexObjects = newFaqObjects;

      if (indexObjects.length) {
        console.log('Adding ' + indexObjects.length + ' new objects to index');
        var addObjectsOperation = index.addObjects(indexObjects)
          .then(function () {
            console.log('Added new objects to the index');
          });
      } else {
        console.log('Nothing to add to the index');
        addObjectsOperation = Promise.resolve();
      }

      Promise.all([addObjectsOperation, deleteObjectsOperation])
        .then(function() {
          fs.writeFile('token', response.nextSyncToken, {encoding: 'utf-8'}, (err) => {
            console.log('All done!');
            if (err) throw err;
          });
        }, function(err) {
          console.error(err);
        });
    }
  ).catch(err => console.log(err));
}

function optionalOrLocale(field, locale) {
  if (!field) {
    return undefined;
  }

  return field[locale];
}

function optionalOrLocaleArray(field, locale) {
  if (!field) {
    return [];
  }

  return field[locale];
}

function getUnixTime(dateTimeString) {
  if (!dateTimeString) {
    return undefined;
  }

  return new Date(dateTimeString).getTime()/1000;
}

function pad(n){
  return n < 10 ? '0' + n : n
}

function filterBlogEntry(item) {
  var fields = item.fields;
  return item.sys.contentType.sys.id === CT_BLOG_POST && fields.publishDate && (fields.oldFileUrl || fields.title);
}

function formatBlogEntry(entry) {
  var fields = entry.fields;
  var sys = entry.sys;

  var authors = optionalOrLocaleArray(fields.authors, 'en-US').map(entry => optionalOrLocale(entry.fields.name, 'en-US'));

  var date = new Date(fields.publishDate['en-US']);
  var slug = optionalOrLocale(fields.oldFileUrl, 'en-US') ? fields.oldFileUrl['en-US'] : parameterize(fields.title['en-US']);
  var url = 'https://www.quirely.com/blog/' + date.getFullYear() + '/' + pad(date.getMonth() + 1) + '/' + pad(date.getDate()) + '/' + slug + '/';

  return {
    objectID: sys.id,
    title: optionalOrLocale(fields.title, 'en-US'),
    teaser: fields.teaser ? removeMd(fields.teaser['en-US']) : undefined,
    introduction: fields.introduction ? removeMd(fields.introduction['en-US']) : undefined,
    content: fields.content ? removeMd(fields.content['en-US']) : undefined,
    publishDate: getUnixTime(optionalOrLocale(fields.publishDate, 'en-US')),
    authors: authors,
    url: url,
    type: 'BlogPost'
  };
}

function filterFaqEntry(entry) {
  var fields = entry.fields;

  return entry.sys.contentType.sys.id === CT_FAQ_CATEGORY && fields.name && fields.entries && fields.entries['en-US'].length > 0;
}

function formatFaqEntry(entry) {
  var fields = entry.fields;

  var categoryName = fields.name['en-US'];
  var baseUrl = 'https://www.quirely.com/faq/' + parameterize(fields.name['en-US']) + '/';
  var entries = fields.entries['en-US'];

  return entries.filter(function (entry) {
    var fields = entry.fields;
    return fields.question && fields.answer;
  }).map(function (entry) {
    var fields = entry.fields;
    var sys = entry.sys;

    var question = fields.question['en-US'];

    return {
      objectID: sys.id,
      title: question,
      categoryName: categoryName,
      introduction: removeMd(fields.answer['en-US']),
      url: baseUrl + '#' + parameterize(question),
      type: 'FaqQuestion'
    };
  });
}

function deleteEntriesFromIndex(deletedEntries, index) {
  var deleteObjects = deletedEntries.map(function(item) {
    return item.sys.id;
  });
  if (deleteObjects.length) {
    console.log('Deleting ' + deleteObjects.length + 'objects from the index');
    return index.deleteObjects(deleteObjects)
      .then(function() {
        console.log('Deleted objects from index');
      })
  }
  else {
    console.log('Nothing to delete from the index');
    return Promise.resolve();
  }
}
