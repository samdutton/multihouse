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
  logLevel: 'info'
};

const ERROR = 'error.txt';
const INPUT = 'input.csv';
const OUTPUT = 'output.csv';

// Delete existing output and error data.
fs.writeFile(OUTPUT, '', () => {
  console.log('Deleted existing output data');
});
fs.writeFile(ERROR, '', () => {
  console.log('Deleted existing error data');
});

// Get page data from CSV file INPUT and run an audit for each page.
// Each line in INPUT begins with a URL followed (optionally) by other CSV data.
// For example: https://johnlewis.com,John Lewis,homepage
const inputFileText = fs.readFileSync(INPUT, 'utf8').trim();
audit(inputFileText.split('\n'));

// Launch Chrome, run a Lighthouse audit, then kill Chrome.
// Code is from https://github.com/GoogleChrome/lighthouse
function launchChromeAndRunLighthouse(url, opts, config = null) {
  return chromeLauncher.launch({chromeFlags: opts.chromeFlags}).then(chrome => {
    opts.port = chrome.port;
    return lighthouse(url, opts, config).then(results => {
      return chrome.kill().then(() => results.lhr)
    });
  });
}

// Run a Lighthouse audit for a web page.
// pages is an array of CSV strings, each ending with a URL.
// For example: John Lewis,homepage,https://johnlewis.com
function audit(pages) {
  const page = pages.pop();
  const url = page.split(',').slice(-1)[0];
  launchChromeAndRunLighthouse(url, OPTIONS).then(results => {
    const runtimeErrorMessage = results.runtimeError.message;
    if (runtimeErrorMessage) {
      console.error(`\n>>>>>>> Runtime error for ${url}\n\n`);
      fs.appendFileSync(ERROR, 
        `Runtime error for ${url}: ${runtimeErrorMessage}\n\n`);
    } else {
      const categories = Object.values(results.categories);
      let scores = [];
      for (let category of categories) {
        scores.push(Math.round(category.score * 100));
      }
      const pageScores = `${page},${scores.join(',')}\n`;
      fs.appendFileSync(OUTPUT, pageScores);
      console.log(pageScores);
      // If there are still pages to audit, call audit() again.
      if (pages.length) {
        audit(pages);
      } else {
        console.log('Completed audit');
      }
    }
  });
}

