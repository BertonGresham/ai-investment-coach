# Knowledge Provenance

## Selden (1912)

- Title: *Psychology of the Stock Market*, G. C. Selden, Ticker Publishing Company, 1912.
- Catalog: https://www.gutenberg.org/ebooks/75570
- Original English text: https://www.gutenberg.org/files/75570/75570-h/75570-h.htm
- Checked: 2026-09-25. The catalog states **Public domain in the USA**. This is not a worldwide clearance, and it does not cover modern Chinese or Korean translations. Confirm applicable rights before distributing a full text or deploying in another jurisdiction.
- Repository content: three short, independently written paraphrases in Chinese and Korean, not copied translations or verbatim quotations. Reflection questions are team-authored applications, not quotations from Selden.
- Chapter I: changing willingness to participate during rising prices. Chapter II: interpretation biased toward one's existing position. Chapter V: separating personal interests from general market conditions.
- The source is historical commentary, not modern empirical validation. Do not attribute SMA20, numerical thresholds, or model-generated judgments to the author.

The market-context endpoint returns chapters II and V for general review and adds chapter I when the user selects `fear_of_missing_out`. This is explicit topic-rule retrieval, not semantic search or an LLM output. Price movement alone does not select a psychological label.

`scripts/ingest_knowledge.py` can index these six language-specific records plus the four original team cards in `behavior_principles.jsonl` into Chroma. It calls a paid Embeddings API when configured. The repository does not contain a prebuilt vector database; this import has not been run with a real key in the current development environment.

## Market Data

Yahoo data is accessed through yfinance for the local educational prototype. The [yfinance documentation](https://ranaroussi.github.io/yfinance/) describes the package's research/educational scope and Yahoo data's personal-use restriction. Availability does not grant redistribution or commercial deployment rights. Before public hosting, confirm the provider's applicable terms or replace the adapter with a licensed data source.

No full book, uploaded screenshot, personal trading history, API key, or Yahoo price cache should be committed to this directory.
