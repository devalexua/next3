KUBECTL ?= kubectl
KUBE_CONTEXT ?= next3
KUBECTL_CONTEXT := $(KUBECTL) --context $(KUBE_CONTEXT)
DEPLOY_DIR := deployments/prod

.PHONY: deploy deploy-postgres deploy-backend deploy-ingress deploy-lb status logs restart

deploy: deploy-postgres deploy-backend deploy-lb

deploy-postgres:
	$(KUBECTL_CONTEXT) apply -f $(DEPLOY_DIR)/postgres-secret.yaml
	$(KUBECTL_CONTEXT) apply -f $(DEPLOY_DIR)/postgres-pvc.yaml
	$(KUBECTL_CONTEXT) apply -f $(DEPLOY_DIR)/postgres-deployment.yaml
	$(KUBECTL_CONTEXT) apply -f $(DEPLOY_DIR)/postgres-service.yaml

deploy-backend:
	$(KUBECTL_CONTEXT) apply -f $(DEPLOY_DIR)/ghcr-secret.yaml
	$(KUBECTL_CONTEXT) apply -f $(DEPLOY_DIR)/backend-secrets.yaml
	$(KUBECTL_CONTEXT) apply -f $(DEPLOY_DIR)/backend-deployment.yaml
	$(KUBECTL_CONTEXT) rollout status deployment/next3-backend

deploy-ingress:
	$(KUBECTL_CONTEXT) apply -f $(DEPLOY_DIR)/ingress.yaml

deploy-lb:
	$(KUBECTL_CONTEXT) apply -f $(DEPLOY_DIR)/backend-loadbalancer-service.yaml
	$(KUBECTL_CONTEXT) get svc next3-backend-lb

status:
	$(KUBECTL_CONTEXT) get pods,svc,ingress

logs:
	$(KUBECTL_CONTEXT) logs deploy/next3-backend -f

restart:
	$(KUBECTL_CONTEXT) rollout restart deployment/next3-backend
	$(KUBECTL_CONTEXT) rollout status deployment/next3-backend
