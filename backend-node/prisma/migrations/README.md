# Vaultly Prisma Migrations (Member 2 coordination artifact)

The project's **existing migration workflow** is `npx prisma db push`
(schema → shared `backend-node/database/vaultly.db`, non-destructive, data
preserved). No `prisma migrate` state machine is in use, so these `.sql` files
are generated **review artifacts** (via `prisma migrate diff --script`) for
Member 1 to inspect — they document exactly what was applied to the shared DB:

- `0001_initial_schema.sql` — the full shared schema (Members 1–3 + Invoices).
- `0002_add_invoices_model.sql` — the Part G change: adds ONLY the `Invoices`
  table + its indexes. Note it contains **no ALTER/CREATE for the Products
  table** — the `invoices Invoices[]` line on the Products model is a Prisma
  back-relation (schema-level only) and does not touch the database.

To re-generate after schema edits:

```bash
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script   # (adjust from/to)
npx prisma db push   # apply to the shared database
```

Schema changes are coordinated with Member 1 before pushing (see
`mychanges.md` for the running log of what was changed and when).
