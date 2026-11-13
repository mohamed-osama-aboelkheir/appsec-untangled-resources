**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Request and response DTOs (Java `record`s) | Default choice; the shape is explicit per endpoint | [Jackson databind](https://github.com/FasterXML/jackson-databind) |
| Bean Validation on the DTO, unknown fields rejected | Bigger payloads; reject rather than ignore extras | [Spring validation](https://docs.spring.io/spring-framework/reference/core/validation/beanvalidation.html) |
| `@InitBinder` allowed fields | Server-rendered forms bound with `@ModelAttribute` | [`@InitBinder`](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-initbinder.html) |
| Jackson annotations on the entity (`@JsonIgnore`, `READ_ONLY`) | Last resort when the entity is the API model | [Jackson annotations](https://github.com/FasterXML/jackson-annotations) |

**Vulnerable — write side: the entity is the request body**

```java
@PutMapping("/api/me")
public User update(@RequestBody User body, @AuthenticationPrincipal AppUser me) {
    body.setId(me.getId());
    return users.save(body);        // {"role":"ADMIN"}, {"credits":9999}, {"tenantId":…} all land
}
```

**Vulnerable — write side: a map straight into the update**

```java
@PutMapping("/api/projects/{projectId}/tasks/{taskId}")
public Task update(@PathVariable String projectId, @PathVariable String taskId,
                   @RequestBody Map<String, Object> body) {
    service.requireTaskInProject(projectId, taskId);
    Update update = new Update();
    body.forEach(update::set);      // {"projectId":"<other>"} moves the task to another project
    mongo.updateFirst(byId(taskId), update, Task.class);
    return tasks.findById(taskId);
}
```

Any key the client sends becomes a field write, including `projectId`,
`createdBy` and dotted paths like `"members.0.role"`.

**Vulnerable — server-rendered form bound to the entity**

```java
@PostMapping("/profile")
public String save(@ModelAttribute User user) {   // a hidden <input name="role"> is enough
    users.save(user);
    return "redirect:/profile";
}
```

**Vulnerable — read side: the entity is the response**

```java
@GetMapping("/api/users/{id}")
public User get(@PathVariable Long id) {
    return users.findById(id).orElseThrow();      // passwordHash, resetToken, mfaSecret, email
}
```

**Mitigated — request and response records**

```java
public record ProfileUpdate(
        @NotBlank @Size(max = 80) String displayName,
        @Size(max = 500) String bio) { }

public record ProfileView(Long id, String displayName, String bio) {
    static ProfileView of(User u) { return new ProfileView(u.getId(), u.getDisplayName(), u.getBio()); }
}

@PutMapping("/api/me")
public ProfileView update(@Valid @RequestBody ProfileUpdate body, @AuthenticationPrincipal AppUser me) {
    User user = users.findById(me.getId()).orElseThrow();
    user.setDisplayName(body.displayName());
    user.setBio(body.bio());
    return ProfileView.of(users.save(user));
}
```

The record has no `role` field, so there is nothing to bind it to. The response
is built field by field, so a column added to the entity later isn't published
by accident.

Docs: [Bean Validation in Spring MVC](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-config/validation.html) · [`@AuthenticationPrincipal`](https://docs.spring.io/spring-security/reference/servlet/integrations/mvc.html)

**Mitigated — reject unknown fields**

```properties
spring.jackson.deserialization.fail-on-unknown-properties=true
```

Spring Boot sets this to `false`, so by default an extra `"role"` is silently
dropped on a DTO. That's safe, but a reviewer or tester can't tell from the
response whether the field was honoured. Failing loudly makes it visible.

Docs: [Customize the Jackson ObjectMapper](https://docs.spring.io/spring-boot/how-to/spring-mvc.html#howto.spring-mvc.customize-jackson-jsonmapper)

**Mitigated — allowlist the map keys**

```java
private static final Set<String> EDITABLE = Set.of("title", "description", "status", "assignedTo");

Map<String, Object> changes = new HashMap<>();
for (String key : EDITABLE) {
    if (body.containsKey(key)) changes.put(key, validate(key, body.get(key)));
}
Update update = new Update();
changes.forEach(update::set);
```

Iterate over the allowlist, not over the request, so an unexpected key can
never reach the update.

Docs: [Spring Data MongoDB `Update`](https://docs.spring.io/spring-data/mongodb/reference/mongodb/template-crud-operations.html)

**Mitigated — form binding**

```java
@InitBinder("user")
void allowedFields(WebDataBinder binder) {
    binder.setAllowedFields("displayName", "bio");
}
```

Better still, bind forms to a DTO too. `setAllowedFields` is an allowlist;
`setDisallowedFields` is a blocklist and misses fields added later.

Docs: [`@InitBinder`](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-initbinder.html)

**Bypasses to check**

- **Privileged field allowed through a second path.** The profile endpoint uses
  a DTO, but registration, an admin import, or the form controller binds the
  entity.
- `@JsonIgnore` on a field that also has a public setter annotated
  `@JsonProperty`, or Lombok `@Data` regenerating setters that the annotation
  was meant to hide. `@JsonProperty(access = READ_ONLY)` is the clearer intent.
- `ObjectMapper.updateValue(entity, body)`, `BeanUtils.copyProperties(body,
  entity)` and MapStruct mappers with no `ignore = true` for privileged
  targets: these copy every matching property.
- `Map<String, Object>` bodies passed to `Update.set`, `Criteria`, or a JPA
  `@Modifying` query builder.
- Nested objects: a DTO that includes `List<Member>` or another entity type,
  so `{"members":[{"role":"owner"}]}` binds into it.
- Read side: the entity returned from one endpoint but a DTO from another;
  `@JsonIgnore` on `passwordHash` but not on `resetToken`; error responses
  and logs that serialize the entity.
- **Check then change:** the DTO is validated, then the raw `Map` or
  `HttpServletRequest` parameters are read again for the write.

**What to grep for**

- `@RequestBody` or `@ModelAttribute` followed by an `@Entity` / `@Document` type
- `@RequestBody Map<String, Object>`, `Update().set`, `forEach(update::set)`
- `BeanUtils.copyProperties(`, `updateValue(`, `convertValue(`
- `@JsonIgnore`, `READ_ONLY`, `fail-on-unknown-properties`, `FAIL_ON_UNKNOWN_PROPERTIES`
- `@InitBinder`, `setAllowedFields`, `setDisallowedFields`
