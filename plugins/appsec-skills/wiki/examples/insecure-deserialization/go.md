Go's standard decoders (`encoding/json`, `encoding/gob`, `encoding/xml`) never
call methods on types the payload chooses, so there are no gadget chains like in
Java or PHP. The risks that remain are decoding into the wrong type, a sender
that chooses the concrete type of an interface, and inputs that use up memory.

**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| `json.Decoder` into a concrete struct with `DisallowUnknownFields` | Best option | [`encoding/json`](https://pkg.go.dev/encoding/json) |
| `http.MaxBytesReader` around the body | Every decoder fed from a request | [`MaxBytesReader`](https://pkg.go.dev/net/http#MaxBytesReader) |
| Signed or encrypted payloads | Round-tripped state | [`crypto/hmac`](https://pkg.go.dev/crypto/hmac), [gorilla/securecookie](https://github.com/gorilla/securecookie) |

**Vulnerable — gob from the network into an interface**

```go
gob.Register(ShellTask{})            // a type whose Run() executes Cmd
var job Task                         // interface { Run() error }
gob.NewDecoder(conn).Decode(&job)    // the sender picks ShellTask{Cmd: "…"}
job.Run()
```

gob doesn't execute anything itself. But any registered type can be chosen by
the sender, and the code then calls its methods.

**Vulnerable — unbounded decode**

```go
var req Upload
json.NewDecoder(r.Body).Decode(&req)   // a 10 GB body, or deeply nested arrays
```

**Mitigated — concrete type, size limit, strict fields**

```go
r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
dec := json.NewDecoder(r.Body)
dec.DisallowUnknownFields()
var req struct {
	Name  string `json:"name"`
	Items []Item `json:"items"`
}
if err := dec.Decode(&req); err != nil { http.Error(w, "bad request", 400); return }
```

Docs: [`Decoder.DisallowUnknownFields`](https://pkg.go.dev/encoding/json#Decoder.DisallowUnknownFields)

**Bypasses to check**

- Decoding into `map[string]any` or `any`, then type-switching into behaviour.
- YAML libraries with custom unmarshalers that do work (`UnmarshalYAML` that opens files or URLs).
- Decompressing untrusted input with no limit, such as `gzip.NewReader` followed by `io.ReadAll`.

**What to grep for**

- `gob.NewDecoder(`, `gob.Register(`, `json.Unmarshal(`, `Decode(&`, `any`, `interface{}`
- `yaml.Unmarshal(`, `UnmarshalYAML`, `UnmarshalJSON`, `MaxBytesReader`, `io.ReadAll(`
