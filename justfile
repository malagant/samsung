# Common dev tasks. Run `just` to list.
default:
    @just --list

install:
    pnpm install

db-up:
    test -d "$PGDATA" || initdb -U "$POSTGRES_USER" --auth=trust -D "$PGDATA"
    pg_ctl -D "$PGDATA" -o "-k $PGHOST -p $PGPORT" -l "$PGDATA/log" start
    createdb -h localhost -U "$POSTGRES_USER" "$POSTGRES_DB" 2>/dev/null || true
    createdb -h localhost -U "$POSTGRES_USER" "${POSTGRES_DB}_test" 2>/dev/null || true

db-down:
    pg_ctl -D "$PGDATA" stop

migrate:
    pnpm --filter @samsung/api db:migrate

dev:
    pnpm dev

check:
    pnpm lint && pnpm typecheck && pnpm test

k8s-validate:
    kustomize build deploy/k8s/overlays/home | kubeconform -strict -ignore-missing-schemas -summary
