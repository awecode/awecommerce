export default defineNuxtConfig({
  extends: ['@awecommerce/api-core'],
  runtimeConfig: {
    // Object storage for product images, used by the backoffice only (the
    // storefront does not extend this layer). An S3-compatible bucket, such as
    // R2 from Node: the endpoint is https://<account>.r2.cloudflarestorage.com
    // and the public URL the bucket's public address. Set with NUXT_S3_*.
    // An R2 binding named R2, when present, is used instead (see
    // server/utils/objectStorage.ts); it still needs the public URL.
    s3: {
      accessKey: '',
      secretKey: '',
      bucketName: '',
      endpointUrl: '',
      region: '',
      publicUrl: '',
    },
  },
})
