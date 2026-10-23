# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration needs no account. Its only secret is the optional TfL app
key, kept by Gladys in the integration configuration: it is sent to TfL in
the query string of each request and never written to the logs nor to the
error messages. The integration stores under `/data` a single file,
`watch.json`: the lines you follow and the stops you watch (with their
filters). Its only network traffic is outbound HTTPS to `api.tfl.gov.uk`;
every request has a timeout.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the TfL services the integration reads.
