#!/bin/bash

set -xu

export CP=mcm
export VERSION=3.2.3
export STAGE=edge
export MANIFEST=offline
export CP_DIR=/opt/ibm-cloudpak/${CP}-${STAGE}_${VERSION}_${MANIFEST}
export ARTIFACTORY_USER=thuy.n.nguyen@ibm.com
export ARTIFACTORY_TOKEN=AKCp5e2qc4xtgwVcJwvdHm5Ed1vEaurYp8dpj32iYPJq6SjMvK8LCkq97VYSK4RszY71xetZL
export MASTER_NODE=worker0.thuyn2.os.fyre.ibm.com
export PROXY_NODE=worker1.thuyn2.os.fyre.ibm.com
export MGMT_NODE=worker2.thuyn2.os.fyre.ibm.com
export INCEPTION=mcm-inception
export SC_NAME=rook-ceph-cephfs-internal
export IMAGE=ibm-cp4mcm-core-1.2-x86_64.tar.gz
export CP_REPO_IMAGE_AND_TAG=https://na.artifactory.swg-devops.com/artifactory/hyc-cloud-private-release-generic-local/offline/MCM-1.2/ibm-cp4mcm-core-1.2-x86_64.tar.gz
