**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| `System.Text.Json` into explicit types | Best option: it doesn't resolve types from the payload | [System.Text.Json](https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/overview) |
| Json.NET with `TypeNameHandling.None` (the default) | Existing Newtonsoft code | [`TypeNameHandling`](https://www.newtonsoft.com/json/help/html/T_Newtonsoft_Json_TypeNameHandling.htm) |
| A `SerializationBinder` allowlist | You really need polymorphic JSON | [`ISerializationBinder`](https://www.newtonsoft.com/json/help/html/SerializeSerializationBinder.htm) |
| Data Protection for round-tripped state | State sent to the client and back | [Data Protection](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/introduction) |

**Vulnerable — `BinaryFormatter` (and its relatives)**

```csharp
var formatter = new BinaryFormatter();
var state = (CartState)formatter.Deserialize(Request.Body);
```

Microsoft calls `BinaryFormatter` dangerous and impossible to secure, and
removed it in .NET 9. `SoapFormatter`, `NetDataContractSerializer`,
`LosFormatter` and `ObjectStateFormatter` have the same problem. ysoserial.net
builds payloads for all of them.

**Vulnerable — Json.NET with type names from the payload**

```csharp
var settings = new JsonSerializerSettings { TypeNameHandling = TypeNameHandling.Auto };
var msg = JsonConvert.DeserializeObject<Message>(body, settings);
// {"$type": "System.Windows.Data.ObjectDataProvider, PresentationFramework", ...}
```

**Mitigated — System.Text.Json into a record**

```csharp
public record CartItem(string Sku, int Qty);
var items = JsonSerializer.Deserialize<List<CartItem>>(body) ?? [];
```

Docs: [`JsonSerializer.Deserialize`](https://learn.microsoft.com/en-us/dotnet/api/system.text.json.jsonserializer.deserialize)

**Mitigated — polymorphism with an allowlist**

```csharp
[JsonPolymorphic(TypeDiscriminatorPropertyName = "kind")]
[JsonDerivedType(typeof(EmailMessage), "email")]
[JsonDerivedType(typeof(SmsMessage), "sms")]
public abstract record Message;
```

The payload can only pick one of the listed types, by a short name. It never
names a .NET type.

Docs: [Polymorphic serialization](https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/polymorphism)

**Bypasses to check**

- `TypeNameHandling` set to anything other than `None`, globally or on one property with `[JsonProperty(TypeNameHandling = ...)]`.
- ASP.NET Web Forms `__VIEWSTATE` with a known or leaked `machineKey`, which gives code execution through `ObjectStateFormatter`.
- `DataContractSerializer` with known types from input, or with `DataContractResolver`.
- Data Protection keys that are shared, or left in the default location of a container that gets rebuilt.

**What to grep for**

- `BinaryFormatter`, `SoapFormatter`, `NetDataContractSerializer`, `LosFormatter`, `ObjectStateFormatter`
- `TypeNameHandling`, `JavaScriptSerializer` with a `SimpleTypeResolver`, `DataContractResolver`
- `machineKey`, `__VIEWSTATE`, `XamlReader.Parse(`
