# Multiple Lighthouse runs for multiple URLs

This app takes URLs and optional metadata from [_input.csv_](src/input.csv) (one row per URL), runs one or more audits synchronously, and outputs median scores to [_output.csv_](src/output.csv).

You can specify multiple different options using the command line options below.

For example:

- The number of times Lighthouse is run for each URL. The default is three.
- Whether to calculate the average or median scores for all the runs. The default is median.
- Which Lighthouse audits to run. The default is all audits: Performance, Best practice, PWA, Accessibility, SEO.
- Whether to include results for all individual audits or for [Web Vitals](https://web.dev/vitals).

By default the app only outputs category scores for each page: Performance, PWA, 
Best practices, Accessibility and SEO. Lighthouse calculates these single scores
based on multiple individual audit scores. If you prefer, you can output results 
for all individual audits by using the `-t` flag, or Web Vitals with the `-w` flag.

---

## Requirements

Node 16.7.0 or above (to support [`performance.getEntriesByName()`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/getEntriesByName)).

## Installation and usage

1. Clone the code using git: `git clone git@github.com:samdutton/multihouse.git` or [download it as a ZIP file](https://github.com/samdutton/multihouse/archive/master.zip).
2. From a terminal window, go to to the `multihouse` directory you created and run `npm install` to install the required Node modules.
3. Add URLs to be audited (and optional metadata) to [_input.csv_](src/input.csv), as described below.
4. From a terminal `cd` to the `src` directory and run `node index.js`, optionally setting the flags below.
5. Progress updates and errors will be logged to the console.
6. When all Lighthouse runs are complete, view the results in [_output.csv_](src/output.csv).
7. Check for errors in _error-log.txt_.

## Input and output data format

Each line in [_input.csv_](src/input.csv) consists of a site name, a page type and a URL.

For example:
```
  My site,homepage,https://example.com
```

See [_sample-input.csv_](src/sample-input.csv) for an example input file.

Audit results are written to [_output.csv_](src/output.csv) with one line per URL.

For example:
```
  My site,homepage,https://example.com,0.50,0.38,0.78,0.87,1
```
See [_sample-output.csv_](src/sample-output.csv) for an example output file.

## Error handling

- Lighthouse runtime errors are logged in _error-log.txt_.
- Any audit that returns a zero score is disregarded, and a warning for the URL and score is logged in _error-log.txt_.
- Lighthouse results with errors are not included in output data.


## Command line options

```
-a, --append        Append output to existing data in output file
-c, --categories    Audits to run: one or more comma-separated values,
                    default is:
                    performance,pwa,best-practices,accessibility,seo
-f, --flags         One or more comma-separated Chrome flags without dashes,
                    default is --headless
-h, --help          Show help
-i, --input         Input file, default is input.csv
-m, --metadata      Optional column headings to be used as the first row of
                    _output.csv_. See [_sample-output.csv_](src/sample-output.csv) 
                    for defaults.
-o, --output        Output file, default is output.csv
-r, --runs          Number of times Lighthouse is run for each page, 
                    default is 3
-s, --score-method  Method of score averaging over multiple runs, 
                    default is median
-t, --all-audits    Include all individual audit scores in output
-w, --web-vitals    Include Web Vitals audits in output
```

##  More

- It's straightforward to log the complete Lighthouse report for each run. 
  By default only category scores are recorded, which are single, aggregate 
  scores calculated from individual audit scores. Look for the code 
  in [`index.js`](src/index.js) marked `***`.
- The data from [`output.csv`](src/output.csv) can easily be used to automatically 
  update a spreadsheet and produce charts using an application such as Google Sheets.
- See [`TODO.md`](TODO.md) for work in progress.


---

Please note that this is not an official Google product.

