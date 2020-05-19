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
let outputFile = 'output.csv';

// Output data for invididual audits, not just categories.
let outputAllAudits = false;

// Output Web Vitals data.
let outputWebVitals = false;

const webVitalsAuditIDs = ['time-to-first-byte', 'first-contentful-paint',
  'largest-contentful-paint', 'speed-index', 'max-potential-fid',
  'first-cpu-idle', 'total-blocking-time', 'cumulative-layout-shift'];
const webVitalsTitles = ['TTFB', 'FCP', 'LCP', 'Speed Index', 'FID',
  'First CPU Idle', 'TBT', 'CLS'];
// audit titles are collected from Lighthouse results.
const auditTitles = new Set();
// Each category is an aggregate score based on multiple audit scores.
let categories =
  ['performance', 'pwa', 'best-practices', 'accessibility', 'seo'];
const categoryTitles =
  ['Performance', 'PWA', 'Best practices', 'Accessibility', 'SEO'];
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
  .alias('t', 'all-audits')
  .alias('w', 'web-vitals')
  .describe('a', 'Append output to existing data in output file')
  .describe('c', 'Categories to test: one or more comma-separated values,\n' +
    'default is: ' + `${categories.join(',')}`)
  .describe('f', 'One or more comma-separated Chrome flags *without* dashes,\n' +
    `default is ${chromeFlags}`)
  .describe('i', `Input file, default is ${inputFile}`)
  .describe('m', 'Headings for optional page information')
  .describe('o', `Output file, default is ${outputFile}`)
  .describe('r', 'Number of times Lighthouse is run for each URL,\n' +
    `default is ${numRuns}`)
  .describe('s', `Method of score averaging over multiple runs,\n` +
    `default is ${scoreMethod}`)
  .describe('t', `Include all individual audit scores in output`)
  .describe('w', 'Include Web Vitals audits in output')
  .help('h')
  .argv;

if (argv.a) {
  appendOutput = true;
}

if (argv.c) {
  const isValid =
    /(performance|pwa|best-practices|accessibility|seo|,)+/.test(argv.c);
  if (isValid) {
    categories = argv.c.split(',');
    console.log(`Auditing categories: ${categories}`);
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

// Headings for page information.
// These will be added to the first line of outputFile.csv,
// followed by the category headings.
// For example:
// • pageHeadings: 'Name,Page type,URL'
// • Categories: 'Performance,PWA,Best Practices,Accessibility,SEO'
// This first line will be followed by a line for each URL successfully audited.
// For example: John Lewis,homepage,https://johnlewis.com, 32, 40, 78, 87, 100
let pageHeadings = ['Name', 'Page type', 'URL'];
if (argv.m) {
  pageHeadings = argv.m.split(',');
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

if (argv.t && argv.w) {
  outputAllAudits = true;
  outputWebVitals = false;
  console.log('\nIncluding scores for all audits including Web Vitals');
} else if (argv.t) {
  outputAllAudits = true;
  console.log('\nIncluding scores for all audits');
} else if (argv.w) {
  outputWebVitals = true;
  console.log('\nIncluding scores for Web Vitals audits');
}

const OPTIONS = {
  chromeFlags: chromeFlags,
  // logLevel: 'info'
  categories: categories,
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

// Get page data from CSV file inputFile.
// Each line in inputFile represents a web page, with CSV values for
// page name, page type and page URL.
// For example: John Lewis,homepage,https://johnlewis.com,
// Note that no checks are done on the validity of inputFile or its data.
const inputFileText = fs.readFileSync(inputFile, 'utf8').trim();
const pages = [];
for (const page of inputFileText.split('\n')) {
  pages.push({
    page: page,
    url: getUrl(page),
  });
}

// The page URL is the third item on each line of CSV data.
// The first two pageParts are website name and page name.
// URLs may contain commas, hence the join().
function getUrl(page) {
  const pageParts = page.split(',');
  return pageParts.slice(2, pageParts.length).join();
}

// okToStart is set to false if the app is being run to get the version number.
if (okToStart) {
  audit(pages);
}

// Run a Lighthouse audit for a web page.
// The pages parameter is an array of CSV strings, each ending with a URL.
// For example: John Lewis,homepage,https://johnlewis.com
const outputData = [];
function audit(pages) {
  console.log(`\nRun ${runIndex + 1} of ${numRuns}: ` +
    `page ${pageIndex + 1} of ${pages.length}`);
  // page corresponds to a line of data in the CSV file inputFile.
  // For example: John Lewis,homepage,https://johnlewis.com
  const page = pages[pageIndex];
  launchChromeAndRunLighthouse(page.url, OPTIONS).then((results) => {
    if (results.runtimeError) {
      displayAndWriteError(`Lighthouse error for ` +
        `${page.url}.\n\n${results.runtimeError.message}`);
    } else {
      // If this is the first run for the current page,
      // add an item for it to results.
      if (!outputData[pageIndex]) {
        outputData[pageIndex] = page;
      }
      handleResults(page.url, results);
    }
  }).catch((error) => {
    const message = page.url === '' ? 'Empty URL' :
      `Caught error for ${page.url}:\n${error}`;
    displayAndWriteError(message);
  }).finally(checkIfFinished);
}

// Launch Chrome and run Lighthouse for a single page.
// Code is from https://github.com/GoogleChrome/lighthouse
function launchChromeAndRunLighthouse(url, opts, config = null) {
  return chromeLauncher.launch({chromeFlags: opts.chromeFlags}).then((chrome) => {
    opts.port = chrome.port;
    return lighthouse(url, opts, config).then((results) => {
      return chrome.kill().then(() => results.lhr);
    });
  });
}

// Handle results from Lighthouse.
// results is an array of objects: page info and scores for each URL.
function handleResults(url, results) {
  // *** Add code here if you want to save complete Lighthouse reports ***
  // Provide scores for categories: Performance, PWA, etc.
  // Each category provides a single aggregate score based on individual audits.
  addCategoryScores(url, results);
  // If flag set, provide scores for Web Vitals audits.
  if (outputWebVitals) {
    addWebVitalsScores(url, results);
  }
  // If flag set, provide data for all invididual audits (not just categories).
  if (outputAllAudits) {
    addAuditScores(url, results);
  }
}

// Categories provide a single aggregate score for Performance, PWA, etc.
// Lighthouse calculates category scores based on indvidual audit scores.
// This app averages category scores over multiple runs, so this function
// pushes scores to an array for each category.
function addCategoryScores(url, results) {
  const categories = Object.values(results.categories);
  for (const category of categories) {
    if (!outputData[pageIndex].categoryScores) {
      outputData[pageIndex].categoryScores = {};
    }
    if (!outputData[pageIndex].categoryScores[category.id]) {
      outputData[pageIndex].categoryScores[category.id] = [];
    }
    const score = Math.round(category.score * 100);
    if (score === 0) {
      displayAndWriteError(`Zero '${category.title}' score for ${url}. ` +
        `This data will be discarded.`);
    } else {
      console.log(`${url}: ${category.title} ${score}`);
      // Scores are collected for multiple runs,
      // then a median or average is provided.
      outputData[pageIndex].categoryScores[category.id].push(score);
    }
  }
}

// Get Web Vitals scores: a subset of audits.
// See https://web.dev/vitals.
// TODO: might be possible to combine this with addAuditScores().
function addWebVitalsScores(url, results) {
  console.log(`\nAdding Web Vitals audit scores for ${url}.`);
  // Check if this audit has already been added to results,
  // i.e. on a previous run.
  for (const auditID of webVitalsAuditIDs) {
    if (!outputData[pageIndex].webVitalsScores) {
      outputData[pageIndex].webVitalsScores = {};
    }
    if (!outputData[pageIndex].webVitalsScores[auditID]) {
      outputData[pageIndex].webVitalsScores[auditID] = [];
    }
    // numericValue is a measured value (such as milliseconds for FCP)
    // whereas score is a rating between 0 and 1.
    const numericValue = results.audits[auditID].numericValue;
    if (numericValue === 0) {
      displayAndWriteError(`Zero ${results.audits[audit].score} score ` +
      `for ${url}. This data will be discarded.`);
    } else {
      console.log(`${url}: ${auditID} ${numericValue}`);
      outputData[pageIndex].webVitalsScores[auditID].push(numericValue);
    }
  }
}

// Provide data for all invididual audits, not just aggregate category scores.
function addAuditScores(url, results) {
  console.log('Adding all individual audit scores to output.');
  // Each value of results.audits has information about the audit
  // and a score for that audit.
  const audits = Object.values(results.audits);
  for (const audit of audits) {
    // TODO: run this once, not for every audit() call.
    auditTitles.add(audit.title);
    // Check if this audit has already been added to results,
    // i.e. on a previous run.
    if (!outputData[pageIndex].auditScores) {
      outputData[pageIndex].auditScores = {};
    }
    if (!outputData[pageIndex].auditScores[audit.id]) {
      outputData[pageIndex].auditScores[audit.id] = [];
    }
    outputData[pageIndex].auditScores[audit.id].push(audit.score);
  }
}

// Check if there are more pages for the current run, or more runs.
function checkIfFinished() {
  // If there are more pages to audit in this run, begin the next page audit.
  if (++pageIndex < pages.length) {
    audit(pages);
  // Otherwise, if there are more runs to do, begin the next run.
  } else if (++runIndex < numRuns) {
    console.log(`\nStart run ${runIndex + 1}`);
    pageIndex = 0;
    audit(pages);
  // Otherwise, write data to outputFile.
  } else {
    // categories is a list of Lighthouse audits completed.
    // For example: Performance, PWA, Best practices, Accessibility, SEO
    fs.appendFileSync(outputFile, createOutputCSV(outputData));
    console.log(`\nCompleted ${numRuns} run(s) for ${outputData.length} URL(s)` +
      `with ${numErrors} error(s).\n\nView output: ${outputFile}\n`);
  }
}

// This function returns a string in CSV format
// Each line has page info followed by median Lighthouse scores for a URL.
// For example: John Lewis,homepage,https://johnlewis.com, 32, 40, 78, 87, 100
// If the outputAllAudits flag is set, all individual audit scores will be appended.
// If the outputWebVitals flag is set, Web Vitals scores will be appended.
// The results parameter is an array of objects, one for each page audited.
// Each object includes page info and Lighthouse results.
function createOutputCSV(results) {
  const output = [];
  // Begin outputCSV with column headings.
  // • Page info headings: Name, page type, URL.
  // • Category titles: Performance, PWA, etc.
  // • Web Vitals titles if outputWebVitals flag was set to include Web Vitals scores.
  // • Audit titles, if outputAllAudits flag was set to include all individual audit scores.
  // Note that auditTitles is empty unless outputAllAudits flag was set.
  let outputCSV = outputWebVitals ?
    [...pageHeadings, ...categoryTitles, ...webVitalsTitles, ...auditTitles].join(',') :
    [...pageHeadings, ...categoryTitles, ...auditTitles].join(',');

  // Add scores for each page successfully audited.
  // results is an array of objects, one for each page audited.
  for (const page of results) {
    // Ignore pages where Lighthouse couldn't get scores (e.g. for 404 or 403).
    if (!page.categoryScores) {
      console.log(`No scores available for ${getUrl(page)}.`);
      continue;
    }

    // Create an array of data for the current page.
    // First item in the arrray is a CSV string with page information.
    // For example: 'John Lewis,homepage,https://johnlewis.com'.
    const pageData = [page.page];

    // Each page.categoryScores key is a category.
    // Each page.categoryScores value is an array of scores from multiple runs.
    // Push a median or average category score to the pageData array.
    // Categories (Performance, PWA, etc.) aggregate individual audit scores.
    for (const categoryScores of Object.values(page.categoryScores)) {
      // Only options at present are median and average
      pageData.push(scoreMethod === 'median' ?
        median(categoryScores) : average(categoryScores));
    }

    // If flag set, append all individual audit scores for the current page.
    if (outputAllAudits) {
      for (const auditScores of Object.values(page.auditScores)) {
        pageData.push(scoreMethod === 'median' ?
          median(auditScores) : average(auditScores));
      }
    // If flag set, add Web Vitals scores for the current page.
    // Web Vitals are a selection of audit scores.
    } else if (outputWebVitals) {
      // webVitalsScores is an array of results for a Web Vitals metric.
      for (const webVitalsScores of Object.values(page.webVitalsScores)) {
        // Only options at present are median and average.
        pageData.push(scoreMethod === 'median' ?
          median(webVitalsScores) : average(webVitalsScores));
      }
    }
    output.push(pageData.join(','));
  }

  outputCSV += `\n${output.join('\n')}`;
  return outputCSV;
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

// Log an error to the console.
function displayError(...args) {
  const color = '\x1b[31m'; // red
  const reset = '\x1b[0m'; // reset color
  console.error(color, '\n>>> Error: ', reset, ...args);
}

// Log an error to the console and write it to the ERROR_LOG file.
function displayAndWriteError(error) {
  numErrors++;
  displayError(`${error}\n`);
  fs.appendFileSync(ERROR_LOG, `Error ${numErrors}: ${error}\n\n`);
}
