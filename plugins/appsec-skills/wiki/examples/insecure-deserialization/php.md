**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| `json_decode` + validation | Best option: JSON creates no objects of your classes | [`json_decode`](https://www.php.net/manual/en/function.json-decode.php) |
| `unserialize($data, ['allowed_classes' => false])` | Legacy data you can't migrate yet | [`unserialize`](https://www.php.net/manual/en/function.unserialize.php) |
| HMAC with `hash_hmac` + `hash_equals` before decoding | Round-tripped state | [`hash_hmac`](https://www.php.net/manual/en/function.hash-hmac.php) |

**Vulnerable — `unserialize` on a cookie**

```php
$cart = unserialize(base64_decode($_COOKIE['cart']));
```

Decoding creates objects of any loaded class and later calls their
`__wakeup`, `__destruct` and `__toString`. PHPGGC has ready-made chains for
Laravel, Symfony, Monolog, Guzzle and more.

**Vulnerable — `phar://` on a user-controlled path**

```php
if (file_exists($_GET['path'])) { ... }     // path = "phar://uploads/avatar.jpg"
```

Before PHP 8.0, any filesystem function on a `phar://` path deserialized the
phar's metadata, so an uploaded "image" acts as a serialized payload.

**Mitigated — JSON**

```php
$cart = json_decode($_COOKIE['cart'] ?? '[]', true, 4, JSON_THROW_ON_ERROR);
```

Docs: [`json_decode`](https://www.php.net/manual/en/function.json-decode.php)

**Mitigated — legacy data: no classes, and a signature first**

```php
[$mac, $payload] = explode('.', $_COOKIE['cart'], 2) + [null, null];
if (!hash_equals(hash_hmac('sha256', $payload, $key), (string)$mac)) abort(400);
$cart = unserialize(base64_decode($payload), ['allowed_classes' => false]);
```

**Bypasses to check**

- `allowed_classes` set to a list that includes a class with a dangerous `__destruct`, or left out.
- Laravel's `APP_KEY` leaked. Encrypted cookies are then decrypted and unserialized (CVE-2018-15133).
- `phar://` reachable through `file_exists`, `getimagesize`, `fopen` or `is_dir` on PHP 7.x.
- Session handlers that unserialize data from a shared Redis or database.

**What to grep for**

- `unserialize(`, `allowed_classes`, `__wakeup`, `__destruct`, `__unserialize`
- `phar://`, `Phar::`, `file_exists(`, `getimagesize(` with input
- `igbinary_unserialize(`, `msgpack_unpack(`, `yaml_parse(`
