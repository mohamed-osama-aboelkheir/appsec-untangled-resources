**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| `.ftlh` templates (HTML auto-escaping; Spring Boot's default suffix) | Every server-rendered page | [Auto-escaping and output formats](https://freemarker.apache.org/docs/dgui_misc_autoescaping.html) |
| `output_format="HTML"` set explicitly | Templates not loaded by a `.ftlh` name: strings, `.ftl` files, emails | [`#ftl` directive](https://freemarker.apache.org/docs/ref_directive_ftl.html) |
| Sanitise, then output as markup | Rich text that must keep its tags | [OWASP Java HTML Sanitizer](https://github.com/OWASP/java-html-sanitizer) |
| Pass data to scripts through a `data-` attribute | Page scripts that need server data | [MDN `dataset`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset) |
| Content Security Policy | Defence in depth, never the only control | [Spring Security headers](https://docs.spring.io/spring-security/reference/servlet/exploits/headers.html) |

FreeMarker escapes `${…}` only when the template has an HTML output format.
That comes from the template's **name** (`.ftlh`), the `<#ftl
output_format="HTML">` header, or the configuration's `output_format`
setting. Spring Boot loads views with the `.ftlh` suffix, so normal pages are
escaped. The review question is which templates *aren't* `.ftlh`, and where
escaping was opted out of: `?no_esc`, `<#noautoesc>`, `<#outputformat
"plainText">`, or markup values built in Java.

**Vulnerable — template built from a string has no output format**

```java
Template template = new Template("report", new StringReader(source), freemarker);
template.process(Map.of("project", project), out);       // ${project.name} is NOT escaped
```

```java
mail.setText(render("welcome", model), true);             // HTML email, same problem
```

The name `"report"` has no `.ftlh` extension, so `.output_format` is
`undefined` and every `${…}` prints raw (verified with Spring Boot 3.3 and
FreeMarker 2.3.33). The page that later shows this output may escape it again,
which hides the problem in testing until someone prints it with `?no_esc` or
sends it as an email.

**Vulnerable — `.ftl` views or a changed suffix**

```properties
spring.freemarker.suffix=.ftl
```

```html
<td>${employee.name}</td>
```

Renaming views to `.ftl` (common in apps started before Spring Boot 2.2, or
copied from older examples) silently turns auto-escaping off for every page. The templates look the same.

**Vulnerable — opting out per value or block**

```html
<div class="bio">${user.bio?no_esc}</div>

<#noautoesc>
  <p>${comment.body}</p>
</#noautoesc>
```

```java
model.addAttribute("bio", HTMLOutputFormat.INSTANCE.fromMarkup(user.getBio()));
```

`?no_esc`, `<#noautoesc>` and a `TemplateMarkupOutputModel` built with
`fromMarkup` all say "this is already HTML". The Java form hides the opt-out
from anyone reading only the template.

**Vulnerable — escaped, but in the wrong context**

```html
<a href="${profile.website}">Website</a>
<a class=${user.theme}>Profile</a>
<button onclick="track('${query}')">Search</button>
<script>const name = "${user.name?js_string?no_esc}";</script>
```

HTML escaping fails here even in a `.ftlh` file:

- `javascript:alert(1)` contains nothing HTML escaping changes.
- An unquoted attribute ends at the first space.
- Inside an event handler, the browser decodes `&#39;` back to `'` before the
  JavaScript runs.
- In a `.ftlh` file, `?js_string` output is HTML-escaped again (`&quot;` breaks
  the JavaScript), so developers add `?no_esc`. That's right only inside a
  quoted string in a `<script>` element. Copied into an attribute or used with
  a different built-in, the value is raw.

**Mitigated — `.ftlh` everywhere**

```properties
spring.freemarker.suffix=.ftlh
```

```html
<td>${employee.name}</td>
<input name="title" value="${employee.title}">
```

Text and double-quoted attribute values are escaped with no further work.
`.ftlh` is Spring Boot's default since 2.2; writing it down stops a later
change from switching it back.

Docs: [Spring Boot FreeMarker properties](https://docs.spring.io/spring-boot/appendix/application-properties/index.html#application-properties.templating.spring.freemarker.suffix) · [Auto-escaping](https://freemarker.apache.org/docs/dgui_misc_autoescaping.html)

**Mitigated — explicit output format for templates outside the views**

```java
Configuration mailCfg = new Configuration(Configuration.VERSION_2_3_33);
mailCfg.setOutputFormat(HTMLOutputFormat.INSTANCE);       // every template here auto-escapes
```

```
<#ftl output_format="HTML">
<p>Hello ${name},</p>
```

Set it on the configuration rather than relying on each template's header, so
a new template can't forget it.

Docs: [`Configuration.setOutputFormat`](https://freemarker.apache.org/docs/api/freemarker/template/Configuration.html#setOutputFormat(freemarker.core.OutputFormat)) · [`#ftl` directive](https://freemarker.apache.org/docs/ref_directive_ftl.html)

**Mitigated — sanitise rich text before marking it as markup**

```java
private static final PolicyFactory RICH_TEXT = Sanitizers.FORMATTING.and(Sanitizers.LINKS).and(Sanitizers.BLOCKS);

model.addAttribute("bio", HTMLOutputFormat.INSTANCE.fromMarkup(RICH_TEXT.sanitize(user.getBio())));
```

```html
<div class="bio">${bio}</div>
```

Make the sanitiser the only place that calls `fromMarkup` for user content, so
a reviewer can grep for `?no_esc` and `fromMarkup` and expect no hits on raw
user data. `Sanitizers.LINKS` allows only `http`, `https` and `mailto` URLs.

Docs: [OWASP Java HTML Sanitizer](https://github.com/OWASP/java-html-sanitizer) · [`HTMLOutputFormat`](https://freemarker.apache.org/docs/api/freemarker/core/HTMLOutputFormat.html)

**Mitigated — safe URL, quoted attributes and script data**

```java
static String safeUrl(String value) {
    try {
        URI uri = new URI(value);
        return "http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme())
                ? uri.toString() : "#";
    } catch (URISyntaxException e) { return "#"; }
}
```

```html
<a href="${websiteUrl}">Website</a>                       <#-- safeUrl applied in the controller -->
<a class="${user.theme}">Profile</a>
<button class="track" data-query="${query}">Search</button>
<div id="bootstrap" data-user="${userJson}"></div>        <#-- userJson = objectMapper.writeValueAsString(…) -->
<script src="/js/page.js"></script>
```

```js
const user = JSON.parse(document.getElementById('bootstrap').dataset.user)
```

The browser decodes the escaped attribute back into the exact JSON, and the
JSON never sits inside a `<script>` element. Handlers read values from `data-`
attributes instead of inline JavaScript, which also lets a CSP drop
`'unsafe-inline'`.

Docs: [Jackson `ObjectMapper`](https://github.com/FasterXML/jackson-databind) · [MDN `dataset`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset)

**Bypasses to check**

- **The name, not the template.** Any `new Template(name, reader, cfg)`,
  `StringTemplateLoader`, or `.ftl` file renders without escaping unless the
  configuration or the `#ftl` header sets an HTML output format. Check emails,
  PDFs, reports and exports, not only views.
- `spring.freemarker.suffix` changed to `.ftl`, or a second
  `FreeMarkerConfigurer` / `Configuration` bean with different settings.
- `?no_esc`, `<#noautoesc>`, `<#outputformat "plainText">`, `?markup_string`
  printed back out, and Java code calling `fromMarkup(…)` or returning
  `TemplateMarkupOutputModel` from a helper.
- `<#ftl output_format="plainText">` or `"XML"` on an HTML page: XML escaping
  is close but not identical, and plain text escapes nothing.
- Context mismatch even with escaping on: unquoted attributes, `href` / `src`
  / `formaction` with `javascript:` or `data:`, `on*` handlers, `style`, and
  values inside `<script>`.
- **Check then change:** a value is sanitised in Java, then the template
  truncates (`?truncate`, `?substring`), replaces or concatenates it before
  printing with `?no_esc`. Cutting sanitised HTML can leave a tag open.
- Stored XSS crossing privilege levels: fields a project member writes that an
  owner or admin page renders. HttpOnly cookies don't help, because the script
  runs on the app's origin and can make requests with the victim's cookie and
  read the CSRF token from the page.
- `spring.freemarker.expose-request-attributes` / `expose-session-attributes`
  putting request or session values into every view, so a value set from user
  input in one filter appears on pages that don't expect it.

**What to grep for**

- `spring.freemarker.suffix`, `.ftl"`, `new Template(`, `StringTemplateLoader`,
  `setOutputFormat`, `output_format`
- `?no_esc`, `noautoesc`, `outputformat`, `fromMarkup(`, `markup_string`
- `href="${`, `src="${`, `=${` (unquoted attribute), `on[a-z]+="[^"]*\$\{`
- `<script>` blocks containing `${`, `?js_string`, `?json_string`
