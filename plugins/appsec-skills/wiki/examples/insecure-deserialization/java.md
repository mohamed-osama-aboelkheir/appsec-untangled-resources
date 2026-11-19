**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| JSON into explicit DTOs (Jackson without default typing) | Best option: any data across a trust boundary | [Jackson polymorphic types](https://github.com/FasterXML/jackson-docs/wiki/JacksonPolymorphicDeserialization) |
| `ObjectInputFilter` allowlist (JEP 290 / JEP 415) | Legacy Java serialization you can't remove yet | [`ObjectInputFilter`](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/io/ObjectInputFilter.html) |
| SnakeYAML `SafeConstructor` (or SnakeYAML 2.x defaults) | YAML input | [SnakeYAML](https://bitbucket.org/snakeyaml/snakeyaml/wiki/Documentation) |
| XStream allowlist (`allowTypes`) | XML object mapping | [XStream security](https://x-stream.github.io/security.html) |

**Vulnerable — `ObjectInputStream` on request data**

```java
@PostMapping("/import")
public void importState(HttpServletRequest req) throws Exception {
    try (ObjectInputStream in = new ObjectInputStream(req.getInputStream())) {
        State s = (State) in.readObject();       // the cast happens after every object is built
    }
}
```

`readObject` builds the whole object graph first, calling `readObject`,
`readResolve` and the like on each class. With a gadget library on the
classpath (commons-collections, Spring, Groovy), a ysoserial payload runs a
command before the cast fails.

**Vulnerable — Jackson default typing**

```java
mapper.activateDefaultTyping(LaissezFaireSubTypeValidator.instance, DefaultTyping.EVERYTHING);
mapper.readValue(body, Object.class);     // {"@class": "com.sun.rowset.JdbcRowSetImpl", ...}
```

The same happens with `@JsonTypeInfo(use = Id.CLASS)` on a field of type
`Object` or `Serializable`.

**Vulnerable — SnakeYAML 1.x default constructor, XStream without a security setup**

```java
new Yaml().load(body);                       // !!javax.script.ScriptEngineManager [...]
new XStream().fromXML(body);
```

**Mitigated — JSON into a DTO**

```java
record ImportRequest(@NotBlank String name, @Size(max = 100) List<@Valid Item> items) {}

@PostMapping("/import")
public void importState(@Valid @RequestBody ImportRequest body) { ... }
```

Docs: [Spring `@RequestBody`](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/requestbody.html)

**Mitigated — allowlist filter for legacy streams**

```java
ObjectInputFilter filter = ObjectInputFilter.Config.createFilter("com.example.State;com.example.Item;java.base/*;!*");
in.setObjectInputFilter(filter);
```

Docs: [Serialization filtering](https://docs.oracle.com/en/java/javase/21/core/serialization-filtering1.html)

**Mitigated — safe YAML**

```java
Yaml yaml = new Yaml(new SafeConstructor(new LoaderOptions()));
Map<String, Object> doc = yaml.load(body);
```

**Bypasses to check**

- A cast or `instanceof` check after `readObject`. The gadget has already run by then.
- Filters written as a blocklist (`!org.apache.commons.collections.*`) instead of an allowlist. New gadget chains appear all the time.
- Hidden users of Java serialization: RMI, JMX, JMS `ObjectMessage`, Hazelcast and Ehcache, and `ViewState` in JSF.
- Jackson `@JsonTypeInfo` on abstract or `Object` fields, and old jackson-databind versions with known gadget CVEs.

**What to grep for**

- `ObjectInputStream`, `readObject(`, `readUnshared(`, `XMLDecoder`, `SerializationUtils.deserialize(`
- `activateDefaultTyping(`, `enableDefaultTyping(`, `@JsonTypeInfo`, `Id.CLASS`
- `new Yaml(`, `XStream`, `fromXML(`, `Kryo`, `Hessian`
