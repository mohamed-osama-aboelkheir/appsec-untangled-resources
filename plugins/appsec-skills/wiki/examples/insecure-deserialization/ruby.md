**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| `JSON.parse` into plain hashes, then validate | Best option | [`JSON`](https://docs.ruby-lang.org/en/master/JSON.html) |
| `YAML.safe_load` (`YAML.load` in Psych 4+) | YAML input | [Psych `safe_load`](https://docs.ruby-lang.org/en/master/Psych.html#method-c-safe_load) |
| Rails `MessageVerifier` / encrypted cookies with the JSON serializer | Round-tripped state | [Rails cookies](https://guides.rubyonrails.org/security.html#session-storage) |

**Vulnerable — `Marshal.load` on request data**

```ruby
prefs = Marshal.load(Base64.decode64(cookies[:prefs]))
```

`Marshal.load` rebuilds objects of any loaded class. Universal gadget chains for
Ruby 2.x and 3.x turn that into code execution.

**Vulnerable — unsafe YAML**

```ruby
YAML.unsafe_load(params[:config])     # also YAML.load on Psych < 4 (Ruby < 3.1)
```

**Vulnerable — Rails cookies with the Marshal serializer**

```ruby
Rails.application.config.action_dispatch.cookies_serializer = :marshal   # or :hybrid reading old cookies
```

If `secret_key_base` leaks, every signed cookie becomes a `Marshal.load`
payload.

**Mitigated — JSON**

```ruby
prefs = JSON.parse(cookies[:prefs] || '{}').slice('theme', 'page_size')
```

**Mitigated — safe YAML with an explicit allowlist**

```ruby
config = YAML.safe_load(params[:config], permitted_classes: [Date], aliases: false)
```

Docs: [Psych `safe_load`](https://docs.ruby-lang.org/en/master/Psych.html#method-c-safe_load)

**Bypasses to check**

- `permitted_classes` that include `Symbol` with `Struct` or `OpenStruct`, or any class with dangerous `init_with` or `[]=` methods.
- `Oj.load` in `:object` mode, and `Ox` object mode.
- A leaked `secret_key_base` together with `:marshal` or `:hybrid` cookies, or cache stores (`MemCacheStore`, `RedisCacheStore`) that use `Marshal` and can be written by others.

**What to grep for**

- `Marshal.load(`, `Marshal.restore(`, `YAML.load(`, `YAML.unsafe_load(`, `Psych.load(`
- `cookies_serializer`, `:marshal`, `:hybrid`, `Oj.load(`, `mode: :object`
- `secret_key_base`, `MessageVerifier`
