# Testing plan

The fourth question, "did we do a good job?", turns the threat model into a
testing plan. Every mitigation gets a test that would **fail if the mitigation
were missing**. A threat with a mitigation and no test is a claim.

## Point-in-time or continuous

- **Point-in-time** tests run once, before release or after a big change: a
  manual check with two accounts, a code review of one function, a
  configuration review, a DAST run, a penetration test.
- **Continuous** tests run on every change or on a schedule: unit and
  integration tests in CI, SAST rules, policy-as-code checks on infrastructure,
  dependency scanning, alerts on suspicious behaviour.

Each test is one or the other, and one test per mitigation is the default:
continuous for controls in code and configuration that change, point-in-time
for things checked once and rarely changed (a registrar lock, MFA on the
payment dashboard). Add a second test of the other type for mitigations that
stop a critical threat, or a high one whose control lives in code that changes
often: check it once now, then keep it true.

## Pick the test

| Mitigation | Point-in-time | Continuous |
|---|---|---|
| AuthN or AuthZ check in code | Requests with two users or two roles | Integration test per route, or a role × route matrix |
| Business rule (price, quantity, state) | Requests that break the rule | Unit test at the boundary |
| Race or replay protection | Parallel or repeated requests | Concurrency test |
| Safe function (parameterized query, auto-escaping) | Code review of every call site | SAST rule that fails on the unsafe form |
| Validation or sanitization | The payload cases on the wiki page | Unit test on the validator |
| Cloud or SaaS configuration | Config review, IAM Access Analyzer | Policy-as-code check, AWS Config rule, drift detection |
| Logging and alerting | Perform the action, find the log | Alert on the event |

Each wiki threat page has a **Test** section with the point-in-time and
continuous test for that threat.

## What to write for each test

- The **mitigations** it tests (one test can cover several mitigations in the
  same group). Tests belong to mitigations, not threats: one mitigation often
  stops several threats.
- **Type**: point-in-time or continuous.
- **Kind**: code review, config review, dynamic test (Burp), pen test, unit,
  integration, concurrency, SAST rule, policy-as-code, dependency scan,
  monitoring, other.
- **How**: what to send or check, and what must happen to pass.
- **Where it runs**: the CI job, the scheduled check, or the person who runs it.
- **Status** and **last run**.

## Done

- Every threat is mitigated or explicitly accepted.
- Every mitigation has at least one test, and its point-in-time tests have
  passed.
- Every continuous test is in CI or scheduled, with an owner.
