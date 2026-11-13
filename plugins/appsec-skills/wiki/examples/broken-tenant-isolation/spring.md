**Mitigation options**

| Option | When it fits | Docs |
|---|---|---|
| Tenant in every repository method (`findByIdAndTenantId`) | Small codebases; explicit at each call site | [Spring Data query methods](https://docs.spring.io/spring-data/jpa/reference/repositories/query-methods-details.html) |
| Tenant-scoped service or repository wrapper | Many controllers; one place to get it right | [Spring Data MongoDB `Criteria`](https://docs.spring.io/spring-data/mongodb/reference/mongodb/template-query-operations.html) |
| Hibernate `@TenantId` (discriminator multi-tenancy) | JPA with Hibernate 6; the ORM adds the filter | [Hibernate multi-tenancy](https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#multitenacy) |
| Database row-level security | PostgreSQL, and you want the database to enforce it | [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) |

The tenant may be an organization, workspace or project. Derive the set of
tenants the caller belongs to from the authenticated user (a membership
lookup, or a verified token claim), never from a header or parameter alone.

**Vulnerable — tenant taken from the request**

```java
@GetMapping("/api/invoices")
public List<Invoice> list(@RequestHeader("X-Tenant-Id") String tenantId) {
    return invoices.findByTenantId(tenantId);       // caller picks the tenant
}
```

**Vulnerable — object ID trusted once authenticated**

```java
@GetMapping("/api/invoices/{id}")
public Invoice get(@PathVariable String id) {
    return invoices.findById(id).orElseThrow();     // any tenant's invoice
}
```

**Vulnerable — tenant-scoped, then overridden by a filter**

```java
// filterable fields derived from the model: tenantId is a property, so it's "allowed"
private static final Set<String> FILTERABLE = Arrays.stream(Recipe.class.getDeclaredFields())
        .map(Field::getName).collect(Collectors.toSet());

@GetMapping("/api/kitchens/{kitchenId}/recipes")
public List<Recipe> list(@PathVariable String kitchenId, @RequestParam Map<String, String> params) {
    kitchens.requireMember(kitchenId, CurrentUser.id());       // checks the path's kitchen
    if (!FILTERABLE.containsAll(params.keySet())) throw new ApiException(BAD_REQUEST, "Unknown filter");

    Document filter = new Document("kitchenId", kitchenId);
    filter.putAll(params);                                     // ?kitchenId=<other> replaces it
    return mongo.find(new BasicQuery(filter), Recipe.class);
}
```

The guard authorizes one tenant and the query reads another.
`/api/kitchens/1/recipes` as an outsider is correctly refused, which is why
this survives testing; `/api/kitchens/<mine>/recipes?kitchenId=1` isn't. Any
map that starts with the tenant key and then merges caller input behaves the
same: `HashMap.putAll`, `Document.putAll`, or an `Example.of(probe)` whose
probe is bound from request parameters after the tenant was set on it. A model-derived allowlist (`getDeclaredFields()`, JPA
`Metamodel`, `MongoPersistentEntity` properties) always contains the tenant,
ownership and audit fields.

**Mitigated — the server's copy of the tenant, in the query**

```java
interface InvoiceRepository extends MongoRepository<Invoice, String> {
    Optional<Invoice> findByIdAndTenantId(String id, String tenantId);
    List<Invoice> findByTenantId(String tenantId);
}

@GetMapping("/api/orgs/{orgId}/invoices/{id}")
public Invoice get(@PathVariable String orgId, @PathVariable String id) {
    memberships.require(orgId, CurrentUser.id());                    // from the identity
    return invoices.findByIdAndTenantId(id, orgId).orElseThrow(NotFound::new);
}
```

Docs: [Spring Data MongoDB repositories](https://docs.spring.io/spring-data/mongodb/reference/mongodb/repositories/query-methods.html)

**Mitigated — scoped query builder, tenant applied last**

```java
private static final Set<String> FILTERABLE = Set.of("name", "category", "createdBy");   // explicit

public List<Recipe> list(String kitchenId, Map<String, String> params) {
    Criteria criteria = new Criteria();
    params.forEach((key, value) -> {
        if (!FILTERABLE.contains(key)) throw new ApiException(BAD_REQUEST, "Unknown filter " + key);
        criteria.and(key).is(value);
    });
    criteria.and("kitchenId").is(kitchenId);                 // trusted key, set by the server
    return mongo.find(Query.query(criteria), Recipe.class);
}
```

Two layers: the allowlist rejects `kitchenId` outright, and the tenant
condition is added by the server after the caller's filters. With `Criteria`,
a second condition on the same key throws instead of replacing the first,
which also fails safe.

Docs: [`Criteria` and `Query`](https://docs.spring.io/spring-data/mongodb/reference/mongodb/template-query-operations.html)

**Mitigated — Hibernate `@TenantId`**

```java
@Entity
public class Invoice {
    @Id Long id;
    @TenantId String tenantId;          // Hibernate adds "tenant_id = ?" to every query
}

@Component
class TenantResolver implements CurrentTenantIdentifierResolver<String> {
    public String resolveCurrentTenantIdentifier() {
        return TenantContext.current();  // set from the authenticated user, per request
    }
    public boolean validateExistingCurrentSessions() { return true; }
}
```

Docs: [Hibernate `@TenantId`](https://docs.jboss.org/hibernate/orm/6.6/userguide/html_single/Hibernate_User_Guide.html#multitenacy)

**Mitigated — row-level security**

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

```java
jdbc.queryForObject("SELECT set_config('app.tenant_id', ?, true)", String.class, tenantId);
```

Run it inside the request's transaction (`true` makes it transaction-local), so
a pooled connection can't carry one tenant's setting into another request.

Docs: [PostgreSQL row security policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) · [`JdbcTemplate`](https://docs.spring.io/spring-framework/reference/data-access/jdbc/core.html)

**Bypasses to check**

- Tenant read from anything the caller controls: `@RequestHeader`,
  `@RequestParam`, a body field, the `Host` subdomain, or a JWT claim the
  filter didn't verify.
- **Scope then override:** the tenant key set first and request parameters
  merged after it (`putAll`, `Document.putAll`, a probe bound from
  `@ModelAttribute`), with the filter allowlist derived from the model.
  Send `?tenantId=<other>` on list, search and export routes in your own tenant.
- `CrudRepository.findById` / `deleteById` used next to scoped finders. Hibernate
  `@Filter` doesn't apply to `findById` (`EntityManager.find`) or native
  queries.
- `@Query(nativeQuery = true)`, `JdbcTemplate`, aggregations
  (`mongo.aggregate`), `$lookup`, counts and report queries that drop the
  tenant condition the simple finder has.
- A `ThreadLocal` tenant context that isn't cleared in a `finally`, or isn't
  propagated to `@Async`, `CompletableFuture` and scheduled jobs, so one
  tenant's ID leaks into another request on the same thread.
- Caches (`@Cacheable`) keyed without the tenant.
- **Check then change:** membership checked for the path's tenant, then the
  write uses `body.getTenantId()` or `entity.setTenantId(request…)`.
- Cross-tenant references accepted as input: assigning a task to a user in
  another project, or moving a record by setting its parent ID.

**What to grep for**

- `tenantId`, `orgId`, `workspaceId`, `projectId`, `X-Tenant`
- `findById(`, `deleteById(`, `nativeQuery = true`, `aggregate(`, `@Cacheable`
- `putAll(`, `new Document(`, `BasicQuery(`, `Example.of(`, `@RequestParam Map`
- `getDeclaredFields()`, `getMetamodel()`, `getPersistentEntity(` used to build an allowlist
- `@TenantId`, `@Filter`, `CurrentTenantIdentifierResolver`, `ThreadLocal`
