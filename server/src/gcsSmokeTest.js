const { Storage } = require("@google-cloud/storage");
const { getConfig } = require("./config");

async function main() {
  const config = getConfig();
  const storage = new Storage({ projectId: config.gcp.projectId });
  const bucket = storage.bucket(config.gcp.bucketName);

  const objectName = `smoke-tests/${Date.now()}-gcs-check.txt`;
  const file = bucket.file(objectName);

  await file.save("refex-p2p-dynamic-pdf gcs smoke test\n", {
    contentType: "text/plain"
  });

  const [existsAfterWrite] = await file.exists();

  const [signedUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 10 * 60 * 1000
  });

  await file.delete();

  const [existsAfterDelete] = await file.exists();

  console.log(JSON.stringify({
    ok: true,
    app_env: config.service.appEnv,
    bucket: config.gcp.bucketName,
    object: objectName,
    exists_after_write: existsAfterWrite,
    signed_url_created: Boolean(signedUrl),
    exists_after_delete: existsAfterDelete
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    code: error.code || null
  }, null, 2));
  process.exit(1);
});
