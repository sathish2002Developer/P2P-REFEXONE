const { getConfig } = require("./config");
const { kfRequest } = require("./kissflowClient");

function processItemDetailPath(processId, instanceId) {
  const config = getConfig();
  return `/process/2/${config.kissflow.accountId}/admin/${processId}/${instanceId}`;
}

async function getProcessItem(processId, instanceId) {
  return kfRequest(processItemDetailPath(processId, instanceId), {
    method: "GET"
  });
}

async function getPurchaseOrderInstance(instanceId) {
  const config = getConfig();
  return getProcessItem(config.kissflowModels.purchaseOrderProcessId, instanceId);
}

async function updateProcessItem(processId, instanceId, payload = {}) {
  return kfRequest(processItemDetailPath(processId, instanceId), {
    method: "PUT",
    body: payload
  });
}

async function updatePurchaseOrderInstance(instanceId, payload = {}) {
  const config = getConfig();
  return updateProcessItem(config.kissflowModels.purchaseOrderProcessId, instanceId, payload);
}

module.exports = {
  processItemDetailPath,
  getProcessItem,
  getPurchaseOrderInstance,
  updateProcessItem,
  updatePurchaseOrderInstance
};
