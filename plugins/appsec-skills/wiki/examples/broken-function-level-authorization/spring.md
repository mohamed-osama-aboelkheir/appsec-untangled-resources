**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| URL rules in the `SecurityFilterChain` | A whole area is one privilege level (`/admin/**`) | [Authorize HTTP requests](https://docs.spring.io/spring-security/reference/servlet/authorization/authorize-http-requests.html) |
| Method security (`@PreAuthorize`) | Mixed privileges in one controller; the rule sits on the method | [Method security](https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html) |
| Service-layer check against the resource's role | Roles are per resource (project admin, org owner), not global | [`@PreAuthorize` with beans](https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html#using_method_parameters) |

Global roles (`ROLE_ADMIN`) and per-resource roles (owner or admin *of this
project*) need different tools. URL rules and `hasRole` only see the global
authorities on the `Authentication`; a per-project role has to be checked in
code, or in a `@PreAuthorize` that calls a bean.

**Vulnerable — annotations that never run**

```java
@SpringBootApplication                       // no @EnableMethodSecurity anywhere
public class App { }

@RestController
class UserAdminController {
    @PreAuthorize("hasRole('ADMIN')")         // silently ignored
    @DeleteMapping("/api/users/{id}")
    void delete(@PathVariable String id) { users.deleteById(id); }
}
```

Without `@EnableMethodSecurity`, `@PreAuthorize`, `@PostAuthorize` and
`@Secured` are plain annotations. The code reads as protected and isn't.

**Vulnerable — one sibling forgotten**

```java
@PostMapping("/{projectId}/members")
public Invitation invite(@PathVariable String projectId, @RequestBody InviteRequest body) {
    return projects.invite(projectId, CurrentUser.id(), body.username(), body.role());  // checks admin
}

@DeleteMapping("/{projectId}/members/{userId}")
public void remove(@PathVariable String projectId, @PathVariable String userId) {
    Project project = projects.getForMember(projectId, CurrentUser.id());   // member only
    store.removeMember(project.getId(), userId);                            // gap
}
```

**Vulnerable — URL rule doesn't match what the controller serves**

```java
http.authorizeHttpRequests(auth -> auth
        .requestMatchers(HttpMethod.GET, "/admin/**").hasRole("ADMIN")   // only GET
        .anyRequest().authenticated());
```

`POST /admin/users/5/role` matches no admin rule and falls through to
`authenticated()`.

**Mitigated — URL rules for whole areas**

```java
http.authorizeHttpRequests(auth -> auth
        .requestMatchers("/admin/**", "/api/admin/**").hasRole("ADMIN")   // every method
        .requestMatchers("/login", "/register").permitAll()
        .anyRequest().authenticated());
```

A new route added under `/admin` is covered by default. Keep the most specific
matchers first, since the first match wins.

Docs: [Authorize HTTP requests](https://docs.spring.io/spring-security/reference/servlet/authorization/authorize-http-requests.html)

**Mitigated — method security**

```java
@Configuration
@EnableMethodSecurity                         // turns the annotations on
class MethodSecurityConfig { }

@PreAuthorize("hasRole('ADMIN')")             // on the class: every method is covered
@RestController
@RequestMapping("/api/admin/users")
class UserAdminController {
    @DeleteMapping("/{id}")
    void delete(@PathVariable String id) { users.deleteById(id); }
}
```

Docs: [`@EnableMethodSecurity`](https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html)

**Mitigated — per-resource role in one place**

```java
@Component("projectAccess")
class ProjectAccess {
    boolean isAdmin(String projectId, Authentication auth) {
        Project p = projects.findById(projectId);
        String role = p == null ? null : p.roleOf(auth.getName());
        return "owner".equals(role) || "admin".equals(role);
    }
}

@PreAuthorize("@projectAccess.isAdmin(#projectId, authentication)")
@DeleteMapping("/{projectId}/members/{userId}")
public void remove(@PathVariable String projectId, @PathVariable String userId) { … }
```

Or call one `requireAdmin(projectId, userId)` helper at the top of every
service method that manages members, so the rule can't drift between invite,
role change and remove.

Docs: [Using beans in expressions](https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html#using-authorization-expression-fields-and-methods)

**Bypasses to check**

- `@PreAuthorize` / `@Secured` / `@RolesAllowed` with no
  `@EnableMethodSecurity` (or `@EnableGlobalMethodSecurity` in old code
  without `prePostEnabled = true`, `securedEnabled` or `jsr250Enabled`).
- Annotations on a method called from the same class (`this.delete(id)`):
  Spring's proxy is skipped, so the check doesn't run. Private methods are
  never proxied either.
- `hasRole('ADMIN')` vs `hasAuthority('ADMIN')`: `hasRole` adds the `ROLE_`
  prefix. A mismatch denies everyone, and the "fix" is often to loosen the rule.
- `requestMatchers` limited to one `HttpMethod`, or a pattern that doesn't
  cover the real path (`/admin/*` vs `/admin/**`, a different servlet path, a
  path variable segment).
- The same action reachable by two routes (the JSON API and the server-rendered
  form controller), with the check in only one controller instead of the
  shared service.
- **Check then change:** the role is validated from the request
  (`role.equals("owner")` rejected), then stored after `toLowerCase()` or
  `trim()`, so `" Owner"` becomes `owner`. Validate against an allowlist after
  normalising, and store the normalised value.
- Spring Data REST exposing repositories (`/profile`, `/users`) with no rules
  at all, or Actuator endpoints (`/actuator/env`, `/actuator/heapdump`).

**What to grep for**

- `@EnableMethodSecurity`, `@EnableGlobalMethodSecurity`, `@PreAuthorize`,
  `@PostAuthorize`, `@Secured`, `@RolesAllowed`
- `requestMatchers(`, `HttpMethod.`, `hasRole(`, `hasAuthority(`, `anyRequest()`
- `isAdmin`, `requireAdmin`, `roleOf`, `getRole()` in services
- `spring-boot-starter-data-rest`, `@RepositoryRestResource`, `management.endpoints`
