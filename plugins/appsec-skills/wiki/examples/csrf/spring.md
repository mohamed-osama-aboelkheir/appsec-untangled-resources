**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Spring Security CSRF protection (on by default) | Any app that authenticates with a cookie | [Spring Security CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html) |
| `CookieCsrfTokenRepository` | No server session (JWT in a cookie), or a JavaScript front end that reads the token | [Persisting the token](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html#csrf-token-repository) |
| `SameSite` on the auth cookie | Always; a baseline, not a replacement for tokens | [`ResponseCookie`](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/http/ResponseCookie.html) |
| No cookie auth on the API (bearer tokens only) | JSON APIs called with an `Authorization` header | [JWT resource server](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html) |

Spring Security checks a CSRF token on every `POST`, `PUT`, `PATCH` and
`DELETE` unless someone turns it off. So the review question is where it was
turned off or narrowed (`csrf.disable()`, `ignoringRequestMatchers`), and
whether those paths really can't be reached with a cookie. CSRF only matters
where the browser sends credentials on its own: cookies (session or JWT) and
HTTP Basic, not an `Authorization: Bearer` header the page sets itself.

**Vulnerable — CSRF disabled while auth is a cookie**

```java
http
    .csrf(AbstractHttpConfigurer::disable)            // "it's a stateless JWT app"
    .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
    .addFilterBefore(new JwtCookieFilter(jwt), UsernamePasswordAuthenticationFilter.class);
```

Stateless isn't the same as CSRF-proof. If the JWT is in a cookie, the
browser attaches it to a cross-site form post exactly like a session cookie.

**Vulnerable — API exempted, but the API also accepts the cookie**

```java
http.csrf(csrf -> csrf.ignoringRequestMatchers("/api/**"));
```

```java
String token = bearer(request);
if (token == null) token = cookie(request, "token");   // fallback makes /api cookie-authenticated
```

The exemption is safe only if `/api/**` authenticates exclusively from the
`Authorization` header.

**Vulnerable — state change on GET, or a mapping with no method**

```java
@GetMapping("/projects/{id}/delete")                      // an <img> tag triggers it
public String delete(@PathVariable String id) { … }

@RequestMapping("/account/email")                         // GET, POST, … all accepted
public String changeEmail(@RequestParam String email) { … }
```

CSRF protection skips `GET`, so either form is a write with no token.

**Mitigated — keep the default, render the token**

```java
http.csrf(Customizer.withDefaults());                    // or leave csrf() out entirely
```

```html
<#-- FreeMarker (.ftlh) -->
<form method="post" action="/account/email">
  <input type="hidden" name="${_csrf.parameterName}" value="${_csrf.token}">
  <input type="email" name="email" required>
  <button type="submit">Save</button>
</form>
```

Thymeleaf with `th:action` and Spring's `<form:form>` tag add the hidden field
automatically. FreeMarker and plain HTML need it written in, or exposed to the
model with a `@ModelAttribute("csrf") CsrfToken`.

Docs: [CSRF in forms](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html#csrf-integration-form)

**Mitigated — no server session: cookie token repository**

```java
http.csrf(csrf -> csrf
        .csrfTokenRepository(new CookieCsrfTokenRepository())          // HttpOnly by default
        .ignoringRequestMatchers(request -> request.getRequestURI().startsWith("/api/")));
```

```java
// /api/** reads the bearer header only; pages read the cookie only
String token = request.getRequestURI().startsWith("/api/") ? bearer(request) : cookieToken(request);
```

The default repository keeps the token in the `HttpSession`, which a
stateless app doesn't want, so the token goes in a cookie and the form echoes
it back. Use
`CookieCsrfTokenRepository.withHttpOnlyFalse()` only when JavaScript must read
it, and send it back in the `X-XSRF-TOKEN` header. The `/api` exemption holds
here because the API never looks at the cookie.

Docs: [`CookieCsrfTokenRepository`](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html#csrf-token-repository-cookie) · [Single-page applications](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html#csrf-integration-javascript-spa)

**Mitigated — SameSite on the auth cookie**

```java
ResponseCookie cookie = ResponseCookie.from("token", jwt)
        .httpOnly(true).secure(true).sameSite("Lax").path("/").build();
response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
```

```properties
server.servlet.session.cookie.same-site=lax
```

`Lax` still sends the cookie on top-level `GET` navigations, so it only helps
if no `GET` route changes state. Keep the token check as well: `SameSite`
doesn't stop requests from sibling subdomains, which count as same-site.

Docs: [Session cookie properties](https://docs.spring.io/spring-boot/appendix/application-properties/index.html)

**Bypasses to check**

- `csrf.disable()` or `csrf(AbstractHttpConfigurer::disable)` anywhere, and
  what authenticates those requests: a session cookie, a JWT cookie, HTTP Basic,
  or "remember me".
- `ignoringRequestMatchers(...)` covering paths that also accept a cookie, or
  a matcher written with `startsWith` / `contains` that covers more than meant.
- Several `SecurityFilterChain` beans: the chain for `/api/**` disables CSRF,
  and a later change moves a cookie-authenticated route under it.
- `@RequestMapping` without `method`, `@GetMapping` on a write, or
  `HiddenHttpMethodFilter` (`_method=DELETE`) turning a `POST` into another
  verb. Spring Boot leaves it off unless
  `spring.mvc.hiddenmethod.filter.enabled=true`.
- The token rendered in forms but a custom `CsrfTokenRequestHandler` or
  `requireCsrfProtectionMatcher` that never matches.
- `sameSite("None")` without a token, or no `SameSite` at all on a
  hand-built `Set-Cookie`.
- CORS that allows credentials from a reflected or loosely matched origin
  (`allowedOriginPatterns("*")` with `allowCredentials(true)`).
- Login CSRF: `/login` excluded from CSRF so an attacker can log a victim into
  the attacker's account.

**What to grep for**

- `csrf(`, `disable()`, `ignoringRequestMatchers`, `requireCsrfProtectionMatcher`,
  `CsrfTokenRepository`, `withHttpOnlyFalse`
- `_csrf`, `CsrfToken`, `X-XSRF-TOKEN`
- `@RequestMapping(` without `method`, `@GetMapping` on paths with `delete`,
  `remove`, `update`, `approve`
- `sameSite`, `same-site`, `ResponseCookie`, `allowCredentials`, `hiddenmethod`
