import assert from "node:assert/strict";
import test from "node:test";

import {
  createRegistryClient,
  parseRegistryLinkHeader,
  registryConfigFromEnv
} from "../src/registryClient.ts";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...init.headers },
    ...init
  });
}

test("reads only deploy-level public registry settings from Vite env", () => {
  const config = registryConfigFromEnv({
    VITE_REGISTRY_URL: "https://registry.example.com/",
    VITE_REGISTRY_USERNAME: "robot",
    VITE_REGISTRY_PASSWORD: "secret",
    VITE_REGISTRY_PAGE_SIZE: "250",
    VITE_REGISTRY_REQUEST_TIMEOUT_SECONDS: "12"
  });

  assert.deepEqual(config, {
    registryUrl: "https://registry.example.com",
    username: "robot",
    password: "secret",
    pageSize: 100,
    requestTimeoutSeconds: 12
  });
});

test("keeps env config empty when no registry URL is provided", () => {
  assert.equal(registryConfigFromEnv({}), null);
});

test("parses registry pagination cursor from Link header", () => {
  const pagination = parseRegistryLinkHeader("</v2/_catalog?n=2&last=repo%2Fapi>; rel=\"next\"");

  assert.deepEqual(pagination, {
    next: "repo/api",
    hasNext: true
  });
});

test("registry client lists repositories with Basic Auth and pagination", async () => {
  const seen: { url: string; authorization: string | null }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    seen.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("Authorization")
    });
    return jsonResponse(
      { repositories: ["app/backend"] },
      { headers: { Link: "</v2/_catalog?n=2&last=app%2Fbackend>; rel=\"next\"" } }
    );
  };

  const client = createRegistryClient({
    config: {
      registryUrl: "https://registry.example.com",
      username: "robot",
      password: "secret",
      pageSize: 2,
      requestTimeoutSeconds: 5
    },
    fetcher
  });

  const result = await client.listRepositories();

  assert.deepEqual(result.repositories, ["app/backend"]);
  assert.deepEqual(result.pagination, { next: "app/backend", hasNext: true });
  assert.equal(seen[0].url, "https://registry.example.com/v2/_catalog?n=2");
  assert.equal(seen[0].authorization, "Basic cm9ib3Q6c2VjcmV0");
});

test("registry client reads manifest digest from exposed header", async () => {
  const fetcher: typeof fetch = async () => jsonResponse(
    { schemaVersion: 2, mediaType: "application/vnd.oci.image.manifest.v1+json", layers: [] },
    {
      headers: {
        "Content-Type": "application/vnd.oci.image.manifest.v1+json",
        "Docker-Content-Digest": "sha256:manifest"
      }
    }
  );

  const client = createRegistryClient({
    config: {
      registryUrl: "https://registry.example.com",
      pageSize: 100,
      requestTimeoutSeconds: 30
    },
    fetcher
  });

  const manifest = await client.getManifest("app/backend", "latest");

  assert.equal(manifest.digest, "sha256:manifest");
  assert.equal(manifest.repository, "app/backend");
  assert.equal(manifest.reference, "latest");
  assert.equal(manifest.mediaType, "application/vnd.oci.image.manifest.v1+json");
});
