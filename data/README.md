# Data

`results.json` is the published scan. The page and `https://raw.githubusercontent.com/accomplish999/premium-domains/main/data/results.json` both read it. The schema is in the repository README. The daily job overwrites it.

## Word lists

`words.txt` is the dictionary the prefilter consults. It is the [dwyl/english-words](https://github.com/dwyl/english-words) `words_alpha.txt` list, cut to letters `a-z` and length 3 through 12. That repository describes its lists as public domain.

`common.txt` is the [first20hours/google-10000-english](https://github.com/first20hours/google-10000-english) US no-swear list, cut the same way. It is a public-domain frequency list. It does not decide whether a name passes. It decides which names are valued first when `--max-values` is smaller than the prefilter.

`extra.txt` adds spellings the alpha list missed and this tool still treats as words. Today that is `wiki`.

One-letter and two-letter labels are not in these files. The prefilter allows them because of their length.
