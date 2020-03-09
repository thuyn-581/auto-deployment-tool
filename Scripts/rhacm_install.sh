#!/bin/bash

set -o errexit
set -o nounset
set -euo pipefail

#export GITHUB_USER=thuyn-581
#export GITHUB_TOKEN=xxxx //SYNERGY_CHART_PASSWD

#export RHACM_QUAY_USERNAME=xxx //SYNERGY_USER
#export RHACM_QUAY_TOKEN=xxx //SYNERGY_USER

#export RHACM_RELEASE=1.0.0  # release version of RHACM (this may change but 1.0.0 is defaut value now)
#export RHACM_STREAM=integration  # don't change this
#export RHACM_SNAPSHOT=SNAPSHOT-2020-03-05-19-41-24
#export RHACM_NAMESPACE=multicloud-system

export HIVE_NAMESPACE="hive"
export STRIPPED=`echo "$RHACM_SNAPSHOT" | sed -e "s/^SNAPSHOT-//"`
export URL="https://raw.githubusercontent.com/open-cluster-management/pipeline/${RHACM_RELEASE}-${RHACM_STREAM}/snapshots/manifest-${STRIPPED}.json"

echo "downloading manifest file from $URL"
sudo curl -sSL -o manifest.json -H "Authorization: token ${GITHUB_TOKEN}" -H 'Accept: application/vnd.github.v3.raw' "$URL"

export SHA=$(jq -r '.[] | select(.name == "multicloudhub-operator") | .sha256' manifest.json)

echo "Cloning multicloudhub-operator at git commit $SHA"
# make a new blank repository in the current directory
git init

# add a remote
git remote add origin git@github.com:open-cluster-management/multicloudhub-operator.git

# fetch master
git fetch origin master

# reset this repository's master branch to the commit of interest
git reset --hard FETCH_HEAD

# fetch a commit
git fetch origin $SHA

# set parameters needed by Makefile
export VERSION=$RHACM_RELEASE-$RHACM_SNAPSHOT
export REGISTRY="quay.io/open-cluster-management"

sed -i "s|namespace: default|namespace: $RHACM_NAMESPACE|g" deploy/subscription.yaml
sed -i "s|sourceNamespace: default|sourceNamespace: $RHACM_NAMESPACE|g" deploy/subscription.yaml
sed -i "s|namespace: default|namespace: $RHACM_NAMESPACE|g" deploy/kustomization.yaml
sed -i "s|newName: quay.io/rhibmcollab/multicloudhub-operator|newName: $REGISTRY/multicloudhub-operator|g" deploy/kustomization.yaml
sed -i "s|newTag: latest|newTag: $RHACM_RELEASE-$RHACM_SNAPSHOT|g" deploy/kustomization.yaml

make deps
make olm-catalog

# create namespaces
oc create namespace $HIVE_NAMESPACE
oc create namespace $RHACM_NAMESPACE

# switch to namespace
oc project $RHACM_NAMESPACE

# create quay-secret
kubectl create secret docker-registry quay-secret --docker-server=quay.io --docker-username=$RHACM_QUAY_USERNAME --docker-email= --docker-password=$RHACM_QUAY_TOKEN

# create operator group
cat <<EOF >operator-group.yaml
apiVersion: operators.coreos.com/v1
kind: OperatorGroup
metadata:
  name: default
spec:
  targetNamespaces:
  - $RHACM_NAMESPACE
EOF
oc apply -f operator-group.yaml

# create multicloudhub-resources
oc apply -f build/_output/olm/multicloudhub.resources.yaml

# create subscription
oc apply -f build/_output/olm/subscription.yaml

echo "waiting for multicloudhub-operators to initialize..."
wait_time=0
wait_duration=300
until oc get crd multicloudhubs.operators.multicloud.ibm.com --no-headers > /dev/null; do
    sleep 10
    ((wait_time=wait_time+10))
    echo "Waited $wait_time/$wait_duration seconds for CRD."
    if [[ $wait_time -gt $wait_duration ]]; then
        echo "Waited $wait_duration seconds for CRD but it never came up!  Exiting with a failure."
        exit 1
    fi
done

echo "ok let's move on."
sed -i "s|namespace: default|namespace: $RHACM_NAMESPACE|g" build/_output/olm/operators.multicloud.ibm.com_v1alpha1_multicloudhub_cr.yaml
sed -i "s|imageTagPostfix: \"\"|imageTagPostfix: \"$RHACM_SNAPSHOT\"|g" build/_output/olm/operators.multicloud.ibm.com_v1alpha1_multicloudhub_cr.yaml
sed -i "s|ocpHost: \"\"|ocpHost: \"$OPENSHIFT_CLUSTER_NAME.$OPENSHIFT_BASE_DOMAIN\"|g" build/_output/olm/operators.multicloud.ibm.com_v1alpha1_multicloudhub_cr.yaml
sed -i "s|endpoints: http://etcd-cluster.default.svc.cluster.local:2379|endpoints: http://etcd-cluster.$RHACM_NAMESPACE.svc.cluster.local:2379|g" build/_output/olm/operators.multicloud.ibm.com_v1alpha1_multicloudhub_cr.yaml
sed -i "s|endpoints: mongo-0.mongo.default|endpoints: mongo-0.mongo.$RHACM_NAMESPACE|g" build/_output/olm/operators.multicloud.ibm.com_v1alpha1_multicloudhub_cr.yaml

echo "deploying example-multicoudhub operator cr..."
oc apply -f build/_output/olm/operators.multicloud.ibm.com_v1alpha1_multicloudhub_cr.yaml