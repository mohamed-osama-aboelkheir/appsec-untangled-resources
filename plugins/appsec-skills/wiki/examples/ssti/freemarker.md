**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Pass input as data, never as template source | Almost always | [FreeMarker data model](https://freemarker.apache.org/docs/pgui_quickstart_createdatamodel.html) |
| Fixed template files chosen from an allowlist | The page or partial itself must vary | [Template loading](https://freemarker.apache.org/docs/pgui_config_templateloading.html) |
| A dedicated, locked-down `Configuration` for user templates | Users must edit templates (reports, emails) and you accept the residual risk | [FAQ: untrusted templates](https://freemarker.apache.org/docs/app_faq.html#faq_template_uploading_security) |
| A logic-less engine | Users only need to fill in placeholders | [Mustache.java](https://github.com/spullara/mustache.java) · [Liqp](https://github.com/bkiers/Liqp) |

FreeMarker's own FAQ says templates from untrusted authors aren't safe even
with every option locked down. The usual way in is the `?new` built-in, which
instantiates any class that implements `TemplateModel`.
FreeMarker ships two such classes that run code:
`freemarker.template.utility.Execute` (a shell command) and `ObjectConstructor`
(any Java constructor). In FreeMarker 2.3.x, the default
`new_builtin_class_resolver` is `UNRESTRICTED_RESOLVER`, and Spring Boot
doesn't change it. Injected template text is remote code execution.

**Vulnerable — user input compiled as a template**

```java
public String render(String templateSource, Project project) throws Exception {
    Template template = new Template("report", new StringReader(templateSource), freemarker);
    StringWriter out = new StringWriter();
    template.process(Map.of("project", project), out);
    return out.toString();
}
```

```
<#assign ex="freemarker.template.utility.Execute"?new()>${ex("id")}
```

This is the "customizable report template" or "email template" feature. It
reuses Spring's view `Configuration` (`FreeMarkerConfig.getConfiguration()`),
so it inherits the unrestricted resolver. Passing only one object (`project`)
doesn't help, because `?new` needs nothing from the data model. A template that
was saved earlier and rendered later is the same sink. Look for where the
source string came from, not only where it's rendered.

**Vulnerable — user input concatenated into a template**

```java
String src = "Hello " + user.getDisplayName() + ", your order ${order.id} shipped.";
new Template("mail", new StringReader(src), cfg).process(model, out);
```

Only part of the string comes from the user. A display name containing
`${…}` or `<#…>` runs.

**Vulnerable — re-rendering output, `?interpret` and `?eval`**

```
<#assign inline = userText?interpret>
<@inline/>
${userExpression?eval}
```

`?interpret` compiles a string as a template at render time, and `?eval`
evaluates it as an expression. Both turn data into code inside a template that
is itself safe. The same goes for Java code that renders a template, stores
the output, and later compiles that output as a template.

**Vulnerable — user input chooses the view**

```java
@GetMapping("/pages")
public String page(@RequestParam String name) {
    return "pages/" + name;          // view name from input
}
```

FreeMarker's loader keeps the template path inside the template root, so this
usually leaks other templates rather than files. But a view name also selects
Spring's view resolver: with a `redirect:` or `forward:` prefix it becomes an
open redirect or an internal forward. And if Thymeleaf is also on the
classpath, `__${…}__` in the name is an expression injection. Map the name
through an allowlist.

**Mitigated — input is data**

```java
// templates/report.ftlh holds the fixed layout
Template template = freemarker.getTemplate("report.ftlh");
template.process(Map.of("name", project.getName(), "status", project.getStatus(),
                        "intro", userIntroText), out);
```

```
<h1>${name}</h1>
<p>Status: ${status}</p>
<p>${intro}</p>
```

The template is a file. User text arrives only as a value, which FreeMarker
prints and never parses. Offer "customization" as a choice of fixed sections or
fields, not as editable template source.

Docs: [`Configuration.getTemplate`](https://freemarker.apache.org/docs/api/freemarker/template/Configuration.html#getTemplate(java.lang.String))

**Mitigated — allowlist the template name**

```java
private static final Map<String, String> PAGES = Map.of(
        "about", "pages/about",
        "pricing", "pages/pricing");

@GetMapping("/pages")
public String page(@RequestParam String name) {
    return PAGES.getOrDefault(name, "pages/about");
}
```

Docs: [Spring MVC view names](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/viewresolver.html)

**Mitigated — user templates in a separate, locked-down configuration**

```java
Configuration userTemplates = new Configuration(Configuration.VERSION_2_3_33);
userTemplates.setNewBuiltinClassResolver(TemplateClassResolver.ALLOWS_NOTHING_RESOLVER);
userTemplates.setAPIBuiltinEnabled(false);
userTemplates.setTemplateLoader(null);                     // no <#include> / <#import>
userTemplates.setOutputFormat(HTMLOutputFormat.INSTANCE);  // auto-escape values
userTemplates.setObjectWrapper(new SimpleObjectWrapper(Configuration.VERSION_2_3_33));

Map<String, Object> model = Map.of(                         // plain values only
        "name", project.getName(),
        "status", project.getStatus(),
        "taskCount", tasks.size());

new Template("report", new StringReader(userSource), userTemplates).process(model, out);
```

`ALLOWS_NOTHING_RESOLVER` disables `?new` entirely. `SimpleObjectWrapper` and a
model of plain strings and numbers mean there are no Java objects whose getters
the template can walk (`project.class.protectionDomain…`). Don't reuse Spring's
view `Configuration` for this. Run it with a timeout, since a template can
still loop. If users need only placeholders, Mustache or Liquid is a smaller
surface than this.

Docs: [`TemplateClassResolver`](https://freemarker.apache.org/docs/api/freemarker/core/TemplateClassResolver.html) · [`setAPIBuiltinEnabled`](https://freemarker.apache.org/docs/api/freemarker/core/Configurable.html#setAPIBuiltinEnabled(boolean)) · [`SimpleObjectWrapper`](https://freemarker.apache.org/docs/api/freemarker/template/SimpleObjectWrapper.html) · [FAQ: untrusted templates](https://freemarker.apache.org/docs/app_faq.html#faq_template_uploading_security)

**Bypasses to check**

- **Check then change:** the source is checked for `<#` or `${`, then
  decoded, trimmed or concatenated before `new Template(...)`. Blocklists also
  miss the square-bracket syntax (`[#assign …]`, when the configuration
  auto-detects it), `<@…>` macro calls, the legacy `#{…}` interpolation, and
  `?interpret` hidden in data.
- `TemplateClassResolver.SAFER_RESOLVER` treated as a sandbox. It blocks only
  `Execute`, `ObjectConstructor` and `JythonRuntime`. Any other
  `TemplateModel` class on the classpath, including your own, is still
  constructible.
- Java objects in the data model. With the default `DefaultObjectWrapper`,
  getters chain freely: `project.class.protectionDomain` renders (verified on
  2.3.33). The default member-access policy blocks the best-known escapes
  (`getClassLoader`, `Class.forName`), but every object you pass widens the
  surface. Spring beans, `request`, `session`, `springMacroRequestContext` or
  the application context in the model are much worse.
- `?api` enabled (`api_builtin_enabled=true`, or `spring.freemarker.settings.api_builtin_enabled`),
  which exposes the Java API of any wrapped object.
- `<#include>` / `<#import>` in user templates resolving through the shared
  template loader, which reads any template in the app.
- FreeMarker before 2.3.30, which predates `DefaultMemberAccessPolicy` and
  allows more reflection from templates. Check the version in `pom.xml` or `build.gradle`.
- Strings rendered by Velocity, Thymeleaf (`TemplateEngine.process` on a
  string), Spring `SpelExpressionParser` or JEXL in the same feature: each is
  its own expression engine.

**What to grep for**

- `new Template(`, `new StringReader(` next to a template, `StringTemplateLoader`,
  `putTemplate(`
- `FreeMarkerConfig`, `getConfiguration()`, `FreeMarkerConfigurer` reused outside views
- `?new`, `?interpret`, `?eval`, `?api` in templates
- `setNewBuiltinClassResolver`, `new_builtin_class_resolver`, `api_builtin_enabled`,
  `spring.freemarker.settings`
- `return "…" +` in `@Controller` methods (view name built from input)
