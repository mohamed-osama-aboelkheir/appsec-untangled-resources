**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Scoped repository query (`findByIdAndOwnerId`) | Default choice; the check can't be forgotten later | [Spring Data query methods](https://docs.spring.io/spring-data/jpa/reference/repositories/query-methods-details.html) |
| Load then check in the service | You need the record anyway, or the rule is more than ownership | [Spring Data `CrudRepository`](https://docs.spring.io/spring-data/commons/reference/repositories/core-concepts.html) |
| `@PreAuthorize` / `@PostAuthorize` with a bean | Rules shared across controllers, expressed once | [Method security](https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html) |

The examples use Spring Data repositories. The same applies to `MongoTemplate`
and `JdbcTemplate`: the owner or parent ID has to be in the query or checked
after it.

**Vulnerable — authenticated, but not authorised**

```java
@DeleteMapping("/api/documents/{id}")
public void delete(@PathVariable Long id) {
    documents.deleteById(id);                   // any logged-in user, any document
}
```

**Vulnerable — child object checked through its parent only**

```java
@GetMapping("/api/projects/{projectId}/tasks/{taskId}")
public Task get(@PathVariable String projectId, @PathVariable String taskId) {
    projects.getForMember(projectId, CurrentUser.id());     // caller is in this project
    return tasks.findById(taskId).orElseThrow();            // but the task can be from any project
}
```

The guard passes for the caller's own project, and `taskId` comes from someone
else's.

**Vulnerable — the ID in the body wins**

```java
@PutMapping("/api/documents/{id}")
public Document update(@PathVariable Long id, @RequestBody Document body) {
    Document doc = documents.findByIdAndOwnerId(id, currentUserId()).orElseThrow(NotFound::new);
    return documents.save(body);                // body.id (and body.ownerId) decide what is written
}
```

**Mitigated — scope the query**

```java
interface DocumentRepository extends JpaRepository<Document, Long> {
    Optional<Document> findByIdAndOwnerId(Long id, Long ownerId);
    long deleteByIdAndOwnerId(Long id, Long ownerId);
}

@DeleteMapping("/api/documents/{id}")
@Transactional
public ResponseEntity<Void> delete(@PathVariable Long id, @AuthenticationPrincipal AppUser me) {
    return documents.deleteByIdAndOwnerId(id, me.getId()) == 0
            ? ResponseEntity.notFound().build()           // same 404 for "not yours"
            : ResponseEntity.noContent().build();
}
```

Docs: [Derived query methods](https://docs.spring.io/spring-data/jpa/reference/repositories/query-methods-details.html) · [`@AuthenticationPrincipal`](https://docs.spring.io/spring-security/reference/servlet/integrations/mvc.html#mvc-authentication-principal)

**Mitigated — tie the child to its parent**

```java
private Task requireTaskInProject(String projectId, String taskId) {
    return tasks.findByIdAndProjectId(taskId, projectId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Task not found"));
}
```

Check the parent (membership), then load the child **with** the parent's ID,
on read, update and delete alike. Load-then-compare
(`task.getProjectId().equals(projectId)`) works too if every path does it.

Docs: [Spring Data MongoDB query methods](https://docs.spring.io/spring-data/mongodb/reference/mongodb/repositories/query-methods.html)

**Mitigated — method security with a bean**

```java
@PostAuthorize("returnObject.ownerId == authentication.principal.id")
public Document get(Long id) {
    return documents.findById(id).orElseThrow(NotFound::new);
}
```

`@PostAuthorize` runs after the method, so use it only on reads: a write would
already have happened. For writes, use `@PreAuthorize("@docAccess.canEdit(#id,
authentication)")`. Both need `@EnableMethodSecurity`.

Docs: [`@PostAuthorize`](https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html#use-postauthorize)

**Bypasses to check**

- **Check one ID, act on another.** Ownership checked for the path ID, then
  `save(body)` writes `body.id`; or a bulk endpoint (`List<Long> ids`) that
  checks only the first element.
- `findById`, `getReferenceById`, `existsById`, `deleteById` from
  `CrudRepository` used directly in a controller or service with no owner or
  parent filter.
- Child resources: tasks, comments, attachments looked up by their own ID
  after the parent was checked; `@DBRef` / JPA relations followed from an
  object the caller owns to one they don't.
- Spring Data REST (`@RepositoryRestResource`) exposing `/documents/{id}` with
  no ownership rule at all.
- Comparing IDs with `==` on `Long` or `String` objects instead of `equals`:
  `Long` values above 127 aren't cached, so the check fails for some IDs and
  someone "fixes" it by removing it.
- Read path scoped but the write path not, or the reverse; a server-rendered
  controller and a JSON controller calling different service methods.
- `@PostAuthorize` on a method that modifies data.
- Different responses for "doesn't exist" (`404`) and "not yours" (`403`),
  which confirms other users' IDs.

**What to grep for**

- `findById(`, `getReferenceById(`, `deleteById(`, `existsById(`, `save(` with a
  request body
- `mongo.findById(`, `mongoTemplate.findById(`, `Query.query(where("_id")`
- `@PathVariable` IDs and `@RequestBody` entities in the same method
- `@PostAuthorize`, `@PreAuthorize`, `@RepositoryRestResource`
