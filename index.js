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

// Delete existing output data.
fs.writeFile(OUTPUT, '', () => {
  console.log('Deleted existing output data');
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
// pages is an array of CSV strings, each beginning with a URL.
// For example: https://johnlewis.com,John Lewis,homepage
function audit(pages) {
  console.log('Pages to audit:', pages);
  const page = pages.pop();
  const url = page.split(',')[0];
  launchChromeAndRunLighthouse(url, OPTIONS).then(results => {
    const runtimeErrorMessage = results.runtimeError.message;
    if (runtimeErrorMessage) {
      console.error(`\n>>>>>>> Runtime error for ${url}\n`);
      fs.appendFileSync(ERROR, 
        `Runtime error for ${url}: ${runtimeErrorMessage}\n\n`);
    } else {
      const categories = Object.values(results.categories);
      let scores = [];
      for (let category of categories) {
        scores.push(category.score);
      }
      const pageScores = `${page},${scores.join(',')}\n`;
      fs.appendFileSync(OUTPUT, pageScores);
      console.log(pageScores);
      // If there are still pages to audit, recursively call the function.
      if (pages.length) {
        audit(pages);
      } else {
        console.log('Completed audit');
      }
    }
  });
}

