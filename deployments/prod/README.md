# Next3 Backend Deployment

This setup deploys the backend API and an in-cluster PostgreSQL instance. The frontend can stay on Vercel.

## Image

GitHub Actions builds and pushes:

```text
ghcr.io/devalexua/next3-backend:latest
```

The image runs `prisma migrate deploy` before starting the Fastify server.

## Kubernetes Order

Create real secret files from the examples first:

```bash
cp deployments/prod/postgres-secret.yaml.example deployments/prod/postgres-secret.yaml
cp deployments/prod/backend-secrets.yaml.example deployments/prod/backend-secrets.yaml
cp deployments/prod/ghcr-secret.yaml.example deployments/prod/ghcr-secret.yaml
```

Edit the copied files, then apply:

```bash
kubectl apply -f deployments/prod/postgres-secret.yaml
kubectl apply -f deployments/prod/postgres-pvc.yaml
kubectl apply -f deployments/prod/postgres-deployment.yaml
kubectl apply -f deployments/prod/postgres-service.yaml
kubectl apply -f deployments/prod/ghcr-secret.yaml
kubectl apply -f deployments/prod/backend-secrets.yaml
kubectl apply -f deployments/prod/backend-deployment.yaml
kubectl apply -f deployments/prod/ingress.yaml
```

## Values To Replace

- `deployments/prod/backend-deployment.yaml`: replace `https://YOUR_VERCEL_APP.vercel.app` with the Vercel frontend URL.
- `deployments/prod/ingress.yaml`: replace `api.next3.example.com` with the backend API domain.
- Vercel: set `NEXT_PUBLIC_API_URL` to the backend API URL, for example `https://api.next3.example.com`.

Keep backend replicas at `1` unless the TxLINE worker is split from the API or guarded by a leader lock.
