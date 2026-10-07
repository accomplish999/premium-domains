# Security

A live run sends domain names to Replicate when `REPLICATE_API_TOKEN` is set, and it downloads public feeds. It does not place a bid. It does not log into a registrar unless you set a DropCatch client id and secret, and then it only downloads the auction file.

Do not paste a token, a client secret, or an account id into an issue. A bug report needs the command and the output, not your identity at a venue.

If you find a vulnerability, open a private security advisory on this repository. Do not file a public issue that includes a working exploit against a dependency, and do not include credentials of any kind.

An estimate can be wrong by a lot. Treat a parser bug that drops a zero, or moves a decimal, as a real bug. Include the feed snippet, the output, and the number you believe the field should hold.
