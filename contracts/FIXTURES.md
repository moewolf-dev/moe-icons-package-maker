# Shared Contract Fixtures

Versioned contract fixtures shared by all Moeicons consumers. Consumers must
validate the SAME fixture bytes; the SHA-256 checksums below pin the canonical
bytes. These checksums are verified by `tests/shared-fixtures.test.ts`.

| Fixture | SHA-256 |
| --- | --- |
| `valid-catalog.json` | `f178e142cf30d5fcf34809eaf4278fb9a802100833f3fef52a5c4655c2b712ce` |
| `valid-partial-manifest.json` | `1286febe325d5c9b8d39cb549d45b8585a6c161d0b012e6d1d6d9b034015396f` |
| `invalid-manifest.json` | `b73df13191aa3beea1abc5b934e29a5a604ca748b91b4f20f3c344243d3290e8` |

Consumers (CLI, code-library, website, worker) import the shared types/schemas
via `moe-icons-package-maker/contracts` or copy the JSON Schema from
`schemas/`. Any consumer that changes a fixture MUST update these checksums and
the shared-fixtures test together, in one commit.
