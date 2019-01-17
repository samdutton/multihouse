/**
 * Copyright 2019 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const chromeLauncher = require('chrome-launcher');
const fs = require('fs');
const lighthouse = require('lighthouse');

const ERROR_LOG = 'error-log.txt';
const VERSION = '1.0 beta';

let numErrors = 0;
let pageIndex = 0;
let runIndex = 0;

let appendOutput = false;
let inputFile = 'input.csv';
let numRuns = 3;
let outputFile = 'output.csv';
let onlyCategories =
  ['performance','pwa','best-practices','accessibility', 'seo'];

let okToStart = true;

const argv = require('yargs')
  .alias('a', 'append')
  .alias('c', 'categories')
  .alias('h', 'help')
  .alias('i', 'input')
  .alias('m', 'metadata')
  .alias('o', 'output')
  .alias('r', 'runs')
  .describe('a', 'Append output to existing data in output file')
  .describe('c', 'Audits to run: one or more comma-separated values,\n' +
    'default is:\n' + `${onlyCategories.join(',')}`)
  .describe('i', `Input file, default is ${inputFile}`)
  .describe('m', 'Headings for optional page metadata')
  .describe('o', `Output file, default is ${outputFile}`)
  .describe('r', 'Number of times audits are run to calculate median values, ' +
    `default is ${numRuns}`)
  .help('h')
  .argv;

if (argv.a) {
  appendOutput = true;
}

if (argv.c) {
  const isValid =
    /(performance|pwa|best-practices|accessibility|seo|,)+/.test(argv.c);
  if (isValid) {
    console.log('', );
    onlyCategories = argv.c.split(',');
    console.log(`Auditing categories: ${onlyCategories}`);
  } else {
    console.error('--c option must be one or more comma-separated values: ' +
      `${argv.c} is not valid`);
    okToStart = false;
  }
}

if (argv.i) {
  inputFile = argv.i;
}

// Headings for optional page metadata.
// These will be prepended to the CSV output followed by the audit categories.
// For example:
// Name,Page type,URL,Performance,PWA,Best Practices,Accessibility,SEO
// This line will be followed by a line for each URL successfully audited.
// For example: John Lewis,homepage,https://johnlewis.com, 32, 40, 78, 87, 100
let metadataValues = 'Name,Page type,URL';
if (argv.m) {
  metadataValues = argv.m;
}

if (argv.o) {
  inputFile = argv.o;
}

if (argv.r) {
  const parsedInput = parseInt(argv.r);
  if (parsedInput) {
    numRuns = parsedInput;
  } else {
    console.error(`--r option must be an integer: ${argv.r} is not valid`);
    okToStart = false;
  }
}

if (argv.v) {
  console.log(`${VERSION}`);
  okToStart = false;
}

const OPTIONS = {
  chromeFlags: ['--headless'],
  // logLevel: 'info'
  onlyCategories: onlyCategories
};

// If required, delete existing output and error data.
if (!appendOutput) {
  fs.writeFile(outputFile, '', () => {
  //  console.log('Deleted old output data');
  });
}
fs.writeFile(ERROR_LOG, '', () => {
//  console.log('Deleted old error data');
});

// Get page data from CSV file inputFile and run an audit for each page.
// Each line in inputFile begins with a URL followed (optionally) by other CSV data.
// For example: https://johnlewis.com,John Lewis,homepage
const inputFileText = fs.readFileSync(inputFile, 'utf8').trim();
// Note that no checks are done on the validity of inputData.
const inputData = inputFileText.split('\n');

// data will be an array of objects, one for each URL audited.
// Each object will have median Lighthouse scores and (optional) metadata.
let data = [];
if (okToStart) {
  audit(inputData);
}

// Run a Lighthouse audit for a web page.
// The pages parameter is an array of CSV strings, each ending with a URL.
// For example: John Lewis,homepage,https://johnlewis.com
function audit(pages) {
  console.log(`Run ${runIndex + 1} of ${numRuns}: ` +
    `URL ${pageIndex + 1} of ${pages.length}`);
  // page corresponds to a line of data in the CSV file inputFile.
  const page = pages[pageIndex];
  // The page URL is the last item on each line of CSV data.
  // Note that split() in the line below doesn't work if URLs have commas.
  const url = page.split(',').slice(-1)[0];
  // data is an array of objects: metadata and scores for each URL.
  if (!data[pageIndex]) {
    data[pageIndex] = {
      metadata: page
    };
  }
  launchChromeAndRunLighthouse(url, OPTIONS).then(results => {
    const error = results.runtimeError.message;
    if (error) {
      logError(`Runtime error for ${url}:\n${error}\n`);
    } else {
      const categories = Object.values(results.categories);
      for (let category of categories) {
        if (!data[pageIndex].scores) {
          data[pageIndex].scores = {};
        }
        if (!data[pageIndex].scores[category.title]) {
          data[pageIndex].scores[category.title] = [];
        }
        const score = Math.round(category.score * 100);
        if (score === 0) {
          logError(`Zero ${category.title} score for ${url}. 
          This data will be discarded.`);
        } else {
          console.log(`${url}: ${category.title} ${score}`);
          data[pageIndex].scores[category.title].push(score);
        }
      }
    }
  }).catch(error => {
    logError(`Caught error for ${url}:\n${error}`);
  }).finally(() => {
    // If there are more pages to audit on this run, begin the next audit.
    if (++pageIndex < pages.length) {
      audit(pages);
    // Otherwise, if there are more runs to do, begin the next run.
    } else if (++runIndex < numRuns) {
      console.log('Start run', runIndex + 1);
      pageIndex = 0;
      audit(pages);
    // Otherwise, write data to the output file.
    } else {
      // categories is a list of Lighthouse audits completed.
      // For example: Performance, PWA, Best practices, Accessibility, SEO
      fs.appendFileSync(outputFile, getOutput(data));
      console.log(`\nCompleted ${numRuns} run(s) for ${data.length} URL(s): ` +
        `${numErrors} error(s)\n`);
    }
  });
}

// Launch Chrome, run a Lighthouse audit, then kill Chrome.
// Code is from https://github.com/GoogleChrome/lighthouse
function launchChromeAndRunLighthouse(url, opts, config = null) {
  return chromeLauncher.launch({chromeFlags: opts.chromeFlags}).then(chrome => {
    opts.port = chrome.port;
    return lighthouse(url, opts, config).then(results => {
      return chrome.kill().then(() => results.lhr);
    });
  });
}

// The testResults parameter is an array of objects, one for each URL audited.
// Each object has median Lighthouse scores and (optional) metadata.
// This function returns a string in CSV format, each line of which has
// optional metadata followed by median Lighthouse scores for a URL.
// For example: John Lewis,homepage,https://johnlewis.com, 32, 40, 78, 87, 100
function getOutput(testResults) {
  let output = [];
  for (const page of testResults) {
    let pageData = [page.metadata];
    for (const scores of Object.values(page.scores)) {
      pageData.push(median(scores));
    }
    output.push(pageData.join(','));
  }
  // Prepend CSV data with headings and audit categories.
  // For example: Name,Page type,URL,Performance,PWA, Accessibility,SEO
  const categories = Object.keys(data[0].scores).join(',');
  return `${metadataValues},${categories}\n${output.join('\n')}`;
}


// Utility functions

function median(array) {
  array = array.sort((a, b) => a - b);
  if (array.length === 0) {
    return 0;
  }
  var middle = Math.floor(array.length / 2);
  if (array.length % 2) {
    return array[middle];
  } else {
    return (array[middle - 1] + array[middle]) / 2;
  }
}

function logError(error) {
  numErrors++;
  console.error(`>>>> ${error}`);
  fs.appendFileSync(ERROR_LOG, `${error}\n\n`);
}
