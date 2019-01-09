Run Lighthouse audits on multiple sites defined in the file _input.csv_.

Each line in _input.csv_ begins with a URL, optionally followed by other comma-separated data for the URL. 

For example: 

  `John Lewis,homepage,https://johnlewis.com`

Results are written to _output.csv_ with one line per URL. For example: 

  `John Lewis,homepage,https://johnlewis.com,0.50,0.38,0.78,0.87,1`

_input.csv_ and _output.csv_ in this repo include example input and output data.

Runtime errors are logged in _error.txt_.

---

Please note that this is not an official Google product.

