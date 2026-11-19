**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Fixed destinations, or an allowlist of hosts | Integrations with known partners | [`urllib.parse`](https://docs.python.org/3/library/urllib.parse.html) |
| Resolve the host and block private ranges, then connect to that IP | Webhooks and "fetch from URL" features | [`ipaddress`](https://docs.python.org/3/library/ipaddress.html), [`socket.getaddrinfo`](https://docs.python.org/3/library/socket.html#socket.getaddrinfo) |
| An egress proxy with its own policy (e.g. Smokescreen) | Many services make outbound calls | [Smokescreen](https://github.com/stripe/smokescreen) |
| No redirects, short timeouts, size limits | Every outbound request from input | [Requests](https://requests.readthedocs.io/en/latest/user/advanced/), [HTTPX](https://www.python-httpx.org/) |

**Vulnerable — fetch whatever URL the user gives**

```python
@app.post('/preview')
def preview():
    r = requests.get(request.json['url'], timeout=5)    # http://169.254.169.254/latest/meta-data/
    return {'title': extract_title(r.text)}
```

**Vulnerable — the host is checked, then redirects are followed**

```python
if urlsplit(url).hostname not in ALLOWED:
    abort(400)
requests.get(url)            # allow_redirects=True by default: an allowed host 302s to 127.0.0.1
```

**Vulnerable — check the name, connect to whatever it resolves to later (DNS rebinding)**

```python
ip = socket.gethostbyname(host)
if ipaddress.ip_address(ip).is_private: abort(400)
requests.get(url)             # resolves again; the second answer can be 127.0.0.1
```

**Mitigated — validate the resolved IP and pin it**

```python
def safe_get(url):
    parts = urlsplit(url)
    if parts.scheme not in ('http', 'https') or not parts.hostname:
        raise ValueError('bad url')
    infos = socket.getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == 'https' else 80))
    ips = {ipaddress.ip_address(i[4][0]) for i in infos}
    if any(ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast for ip in ips):
        raise ValueError('blocked destination')
    # Use a transport that connects to one of the checked IPs (with Host / SNI set to the name),
    # or send the request through an egress proxy that enforces the same rule.
    return pinned_session(ips).get(url, allow_redirects=False, timeout=(3, 5), stream=True)
```

Docs: [`ipaddress` properties](https://docs.python.org/3/library/ipaddress.html#ipaddress.IPv4Address.is_private) · [Requests redirects](https://requests.readthedocs.io/en/latest/user/quickstart/#redirection-and-history)

**Bypasses to check**

- Decimal, octal and IPv6 forms (`2130706433`, `0177.0.0.1`, `[::ffff:127.0.0.1]`) and DNS names that point to private IPs.
- `urllib.request.urlopen` with `file://`, `ftp://`, and libraries such as `pycurl` that support `gopher://`.
- Redirects followed by default (Requests, `urllib`), and `httpx` with `follow_redirects=True`.
- URLs inside documents the server renders, such as images in HTML-to-PDF (WeasyPrint, wkhtmltopdf), XML entities and SVG.
- Cloud metadata reachable from the app (IMDSv1), and internal admin ports.

**What to grep for**

- `requests.`, `httpx.`, `urllib.request.urlopen(`, `aiohttp`, `pycurl`, `urllib3`
- `allow_redirects`, `follow_redirects`, `getaddrinfo(`, `is_private`
- `webhook`, `callback_url`, `image_url`, `import_url`
