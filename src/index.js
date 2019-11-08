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
let chromeFlags = ['--headless'];
let inputFile = 'input.csv';
let numRuns = 3;
const outputFile = 'output.csv';
let onlyCategories =
  ['performance', 'pwa', 'best-practices', 'accessibility', 'seo'];
let scoreMethod = 'median';

let okToStart = true;

const argv = require('yargs')
  .alias('a', 'append')
  .alias('c', 'categories')
  .alias('f', 'flags')
  .alias('h', 'help')
  .alias('i', 'input')
  .alias('m', 'metadata')
  .alias('o', 'output')
  .alias('r', 'runs')
  .alias('s', 'score-method')
  .describe('a', 'Append output to existing data in output file')
  .describe('c', 'Audits to run: one or more comma-separated values,\n' +
    'default is:\n' + `${onlyCategories.join(',')}`)
  .describe('f', 'One or more comma-separated Chrome flags *without* dashes,\n' +
    `default is ${chromeFlags}`)
  .describe('i', `Input file, default is ${inputFile}`)
  .describe('m', 'Headings for optional page metadata')
  .describe('o', `Output file, default is ${outputFile}`)
  .describe('r', 'Number of times Lighthouse audits are run for each URL, ' +
    `default is ${numRuns}`)
  .describe('s', `Method of score aggregation, default is ${scoreMethod}`)
  .help('h')
  .argv;

if (argv.a) {
  appendOutput = true;
}

if (argv.c) {
  const isValid =
    /(performance|pwa|best-practices|accessibility|seo|,)+/.test(argv.c);
  if (isValid) {
    onlyCategories = argv.c.split(',');
    console.log(`Auditing categories: ${onlyCategories}`);
  } else {
    displayError('--c option must be one or more comma-separated values: ' +
      `${argv.c} is not valid`);
    okToStart = false;
  }
}

if (argv.f) {
  chromeFlags = argv.f.split(',').map((flag) => {
    return `--${flag}`;
  });
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
  outputFile = argv.o;
}

if (argv.r) {
  const parsedInput = parseInt(argv.r);
  if (parsedInput) {
    numRuns = parsedInput;
  } else {
    displayError(`--r option must be an integer: ${argv.r} is not valid`);
    okToStart = false;
  }
}

if (argv.s) {
  if (/^(average|median)$/.test(argv.s)) {
    scoreMethod = argv.s;
  } else {
    displayError(`--s option must be average or median: ${argv.s} is not valid`);
    okToStart = false;
  }
}

if (argv.v) {
  console.log(`${VERSION}`);
  okToStart = false;
}

const OPTIONS = {
  chromeFlags: chromeFlags,
  // logLevel: 'info'
  onlyCategories: onlyCategories,
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
const data = [];
if (okToStart) {
  audit(inputData);
}

// We assume that each input line contains at least 3 comma-separated values.
// Only the last value - URL - may contain commas.
// We join all items after two first if the array of data contains more then 3 items.
function getUrl(page) {
  let url;
  const pageParts = page.split(',');
  if (pageParts.length > 3) {
	url = pageParts.slice(2, pageParts.length).join();
  } else {
   url = pageParts[2];
  }
  return url;
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
  const url = getUrl(page);
  // data is an array of objects: metadata and scores for each URL.
  if (!data[pageIndex]) {
    data[pageIndex] = {
      metadata: page,
    };
  }
  launchChromeAndRunLighthouse(url, OPTIONS).then((results) => {
    if (results.runtimeError) {
      logError(`Runtime error for ${url}:\n${results.runtimeError.message}\n`);
    } else {
      // *** Add code here if you want to save complete Lighthouse reports ***
      const categories = Object.values(results.categories);
      for (const category of categories) {
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
  }).catch((error) => {
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
        `${numErrors} error(s)\nView output: ${outputFile}\n`);
    }
  });
}

// Launch Chrome, run a Lighthouse audit, then kill Chrome.
// Code is from https://github.com/GoogleChrome/lighthouse
function launchChromeAndRunLighthouse(url, opts, config = null) {
  return chromeLauncher.launch({chromeFlags: opts.chromeFlags}).then((chrome) => {
    opts.port = chrome.port;
    return lighthouse(url, opts, config).then((results) => {
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
  const output = [];
  for (const page of testResults) {
    const pageData = [page.metadata];
    for (const scores of Object.values(page.scores)) {
      // Only options at present are median and average
      pageData.push(scoreMethod === 'median' ? median(scores) : average(scores));
    }
    output.push(pageData.join(','));
  }
  // Prepend CSV data with headings and audit categories.
  // For example: Name,Page type,URL,Performance,PWA, Accessibility,SEO
  const categories = Object.keys(data[0].scores).join(',');
  return `${metadataValues},${categories}\n${output.join('\n')}`;
}


// Utility functions

function average(array) {
  const sum = array.reduce((a, b) => a + b);
  return Math.round(sum / array.length);
}

function median(array) {
  array = array.sort((a, b) => a - b);
  if (array.length === 0) {
    return 0;
  }
  const middle = Math.floor(array.length / 2);
  if (array.length % 2) {
    return array[middle];
  } else {
    return (array[middle - 1] + array[middle]) / 2;
  }
}

function displayError(...args) {
  const color = '\x1b[31m'; // red
  const reset = '\x1b[0m'; // reset color
  console.error(color, '>>> Error:', reset, ...args);
}

function logError(error) {
  numErrors++;
  displayError(`>>> ${error}`);
  fs.appendFileSync(ERROR_LOG, `${error}\n\n`);
}

