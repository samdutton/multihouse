const chromeLauncher = require('chrome-launcher');
const fs = require('fs');
const lighthouse = require('lighthouse');
// const log = require('lighthouse-logger');

const FLAGS = {
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
const inputFileText = fs.readFileSync(INPUT, 'utf8');
const allPageData = inputFileText.split('\n');
for (let pageData of allPageData) {
  if (pageData !== '') {
    audit(pageData);
  }
}

// Launch Chrome, run a Lighthouse audit, then kill Chrome.
function launchChromeAndRunLighthouse(url, flags = {}, config = null) {
  return chromeLauncher.launch(flags).then(chrome => {
    flags.port = chrome.port;
    return lighthouse(url, flags, config)
      .then(results => chrome.kill().then(() => results));
  });
}

// log.setLevel(flags.logLevel);

// Run a Lighthouse audit for a web page.
// pageData is a CSV string beginning with a URL.
// For example: https://johnlewis.com,John Lewis,homepage
function audit(pageData) {
  const url = pageData.split(',')[0];
  launchChromeAndRunLighthouse(url, FLAGS).then(results => {
    const runtimeErrorMessage = results.lhr.runtimeError.message;
    if (runtimeErrorMessage) {
      console.error(`\n>>>>>>> Runtime error for ${url}\n`);
      fs.appendFileSync(ERROR, 
        `Runtime error for ${url}: ${runtimeErrorMessage}\n\n`);
    } else {
      const categories = Object.values(results.lhr.categories);
      let scores = [];
      for (let category of categories) {
        scores.push(category.score);
      }
      fs.appendFileSync(OUTPUT, `${scores.join(',')},${pageData}\n`);
    }
  });
}

