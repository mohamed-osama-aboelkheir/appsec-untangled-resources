**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Form login + `HttpSession` (Spring Security defaults) | Server-rendered apps; sessions can be revoked server-side | [Form login](https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/form.html) |
| OAuth2 resource server (`oauth2ResourceServer().jwt()`) | Stateless APIs; Spring verifies signature, `exp` and `nbf` for you | [JWT resource server](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html) |
| OAuth2 / OIDC login | Delegated login to an identity provider | [OAuth2 login](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/index.html) |
| Custom `OncePerRequestFilter` with jjwt | Only when the above can't fit; you own every check | [jjwt](https://github.com/jwtk/jjwt) |

Once you declare your own `SecurityFilterChain` bean, Spring Boot's default
("every request needs a login") no longer applies: requests are protected only
by the rules you write, and the first matching rule wins. So review the chain
as a whole: the order of `requestMatchers`, the final `anyRequest()`, every
path in `web.ignoring()`, and every filter added before the authorization
filter.

**Vulnerable — custom JWT filter that parses without verifying**

```java
public class JwtAuthFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String token = bearer(req);
        if (token != null) {
            Claims claims = Jwts.parser().unsecured().build()          // accepts alg "none"
                    .parseUnsecuredClaims(token).getPayload();
            SecurityContextHolder.getContext().setAuthentication(
                    new UsernamePasswordAuthenticationToken(claims.getSubject(), null, List.of()));
        }
        chain.doFilter(req, res);
    }
}
```

Anyone can write their own token with any `sub`. The same happens when the
filter base64-decodes the payload by hand, or catches the verification
exception and carries on with the decoded claims.

**Vulnerable — the last rule lets everything through**

```java
http.authorizeHttpRequests(auth -> auth
        .requestMatchers("/api/admin/**").hasRole("ADMIN")
        .requestMatchers("/api/**").authenticated()
        .anyRequest().permitAll());          // /actuator, /internal, /h2-console …

@Bean
WebSecurityCustomizer ignore() {
    return web -> web.ignoring().requestMatchers("/api/public/**", "/api/reports/**");
}
```

`web.ignoring()` removes the whole filter chain for those paths: no
authentication, no CSRF, no security headers. Paths added under them later are
public by accident.

**Vulnerable — plaintext or fast password hashing**

```java
@Bean
PasswordEncoder passwordEncoder() {
    return NoOpPasswordEncoder.getInstance();     // or new MessageDigestPasswordEncoder("SHA-256")
}
```

**Mitigated — form login with the defaults**

```java
@Bean
SecurityFilterChain web(HttpSecurity http) throws Exception {
    http
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/login", "/register", "/css/**").permitAll()
            .anyRequest().authenticated())                       // default-deny
        .formLogin(form -> form.loginPage("/login"))
        .logout(logout -> logout.deleteCookies("JSESSIONID"))    // invalidates the session
        .sessionManagement(s -> s.sessionFixation(f -> f.changeSessionId()));
    return http.build();
}

@Bean
PasswordEncoder passwordEncoder() {
    return PasswordEncoderFactories.createDelegatingPasswordEncoder();   // bcrypt, upgradable
}
```

```properties
server.servlet.session.cookie.http-only=true
server.servlet.session.cookie.secure=true
server.servlet.session.cookie.same-site=lax
```

`changeSessionId()` is the default, so a session ID planted before login stops
working after it. `DaoAuthenticationProvider` runs a dummy hash when the user
doesn't exist, so the response time doesn't reveal valid usernames.

Docs: [Session fixation](https://docs.spring.io/spring-security/reference/servlet/authentication/session-management.html#ns-session-fixation) · [Password storage](https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html) · [Session cookie properties](https://docs.spring.io/spring-boot/appendix/application-properties/index.html#application-properties.server.server.servlet.session.cookie.same-site)

**Mitigated — JWT resource server**

```java
@Bean
SecurityFilterChain api(HttpSecurity http) throws Exception {
    http
        .securityMatcher("/api/**")
        .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .oauth2ResourceServer(oauth -> oauth.jwt(Customizer.withDefaults()));
    return http.build();
}

@Bean
JwtDecoder jwtDecoder(@Value("${app.jwt-secret}") String secret) {
    SecretKey key = new SecretKeySpec(secret.getBytes(UTF_8), "HmacSHA256");
    NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key)
            .macAlgorithm(MacAlgorithm.HS256).build();          // algorithm pinned
    decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer("https://api.example.com"));
    return decoder;
}
```

Docs: [JWT resource server](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html) · [`NimbusJwtDecoder`](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/oauth2/jwt/NimbusJwtDecoder.html)

**Mitigated — custom filter, if you must**

```java
Optional<String> verify(String token) {
    try {
        return Optional.ofNullable(Jwts.parser()
                .verifyWith(key)                               // signature required
                .requireIssuer("https://api.example.com")
                .build()
                .parseSignedClaims(token)                      // rejects unsigned tokens
                .getPayload()
                .getSubject());
    } catch (JwtException | IllegalArgumentException e) {
        return Optional.empty();                               // no authentication set
    }
}
```

`parseSignedClaims` throws on an unsigned or tampered token, and `exp` is
checked automatically. Set the authentication only on success, and leave the
decision to the authorization rules rather than returning early from the
filter.

Docs: [jjwt reading a JWS](https://github.com/jwtk/jjwt#reading-a-jws)

**Bypasses to check**

- `parseUnsecuredClaims`, `.unsecured()`, `Jwts.parser().parse(token)` without
  `verifyWith`, or a hand-rolled `Base64.getDecoder()` on the token's payload.
- The verification exception caught and logged, with the request continuing
  as the decoded user; or a filter that accepts an expired token "for refresh"
  on every route.
- Weak or shared secrets: a default in `application.properties`, the same key
  in every environment, or a key shorter than the algorithm needs.
- `anyRequest().permitAll()` as the last rule, `web.ignoring()` on
  application paths, and Actuator endpoints exposed
  (`management.endpoints.web.exposure.include=*`) with no rule covering them.
- Rule order: a broad `permitAll()` matcher listed before a narrower
  `authenticated()` one wins, because the first match decides.
- Identity taken from a header or body field (`X-User-Id`, `userId`) instead
  of `SecurityContextHolder` / `@AuthenticationPrincipal`.
- Logout that only clears the cookie while the JWT stays valid until `exp`,
  or a session that isn't invalidated.
- `NoOpPasswordEncoder`, `{noop}` in a delegating encoder's stored values,
  `MessageDigestPasswordEncoder`, `StandardPasswordEncoder`.
- Different messages or status codes for "no such user" and "wrong password"
  in a custom login controller.

**What to grep for**

- `SecurityFilterChain`, `authorizeHttpRequests`, `permitAll()`, `anyRequest()`,
  `web.ignoring()`, `securityMatcher(`
- `OncePerRequestFilter`, `addFilterBefore(`, `SecurityContextHolder.getContext().setAuthentication(`
- `parseUnsecuredClaims`, `unsecured()`, `parseSignedClaims`, `verifyWith`,
  `NimbusJwtDecoder`, `Base64.getDecoder()` near a token
- `NoOpPasswordEncoder`, `{noop}`, `MessageDigestPasswordEncoder`, `PasswordEncoder`
- `sessionFixation`, `sessionCreationPolicy`, `management.endpoints.web.exposure`
