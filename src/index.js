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

const OPTIONS = {
  chromeFlags: ['--headless'],
  // logLevel: 'info'
  onlyCategories: ['performance', 'seo']
};

const APPEND_OUTPUT = true;
const ERROR = 'error.txt';
const INPUT = 'input.csv';
const OUTPUT = 'output.csv';

const NUM_RUNS = 3;

let pageIndex = 0;
let runIndex = 0;

// const readline = require('readline');

// const rl = readline.createInterface({
//   input: process.stdin,
//   output: process.stdout
// });

// rl.question('What do you think of Node.js? ', (answer) => {
//   // TODO: Log the answer in a database
//   console.log(`Thank you for your valuable feedback: ${answer}`);

//   rl.close();
// });

// If required, delete existing output and error data.
if (!APPEND_OUTPUT) {
  fs.writeFile(OUTPUT, '', () => {
    console.log('Deleted old output data');
  });
}
fs.writeFile(ERROR, '', () => {
  console.log('Deleted old error data\n');
});

// Get page data from CSV file INPUT and run an audit for each page.
// Each line in INPUT begins with a URL followed (optionally) by other CSV data.
// For example: https://johnlewis.com,John Lewis,homepage
const inputFileText = fs.readFileSync(INPUT, 'utf8').trim();
// Note that no checks are done on the validity of inputData.
const inputData = inputFileText.split('\n');

let data = [];
audit(inputData);

// Run a Lighthouse audit for a web page.
// data is data for all audit runs for all pages
// pages is an array of CSV strings, each ending with a URL.
// For example: John Lewis,homepage,https://johnlewis.com
function audit(pages) {
  console.log(`Run ${runIndex + 1}: URL ${pageIndex + 1} of ${pages.length}`);
  // page corresponds to a line of data in the CSV file INPUT.
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
      // const pageScores = `${page},${scores.join(',')}\n`;
      // If there are still pages to audit, call audit() again.
    }
  }).catch(error => {
    logError(`Caught error for ${url}:\n${error}`);
  }).finally(() => {
    // If more pages still to audit on this run, begin next audit.
    // Otherwise if there are more runs to do, begin next run.
    // Otherwise, write data to output file.
    if (++pageIndex < pages.length) {
      audit(pages);
    } else if (++runIndex < NUM_RUNS) {
      console.log('Start run', runIndex + 1);
      pageIndex = 0;
      audit(pages);
    } else {
      fs.appendFileSync(OUTPUT, getOutput(data));
      console.log('\ndata: ', getOutput(data));
      console.log('Completed audit\n');
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

// The testResults parameter is an array of objects, each of which has
// Lighthouse scores and (optional) metadata for each URL audited.
// The function returns a stringified version of this array
// with medianScores added to each object.
function getOutput(testResults) {
  let output = [];
  console.log('Categories: ', Object.keys(testResults[0].scores));
  for (const page of testResults) {
    let pageData = [page.metadata];
    for (const scores of Object.values(page.scores)) {
      console.log('scores:', scores);
      pageData.push(median(scores));
    }
    output.push(pageData.join(','));
  }
  console.log('output:', output.join('\n'));
  return output.join('\n');
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
  console.error(`>>>> ${error}`);
  fs.appendFileSync(ERROR, `${error}\n\n`);
}
