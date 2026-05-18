package server

import (
	"net/url"
	"strings"
)

func registryTagsPath(repository string, query url.Values) string {
	return "/v2/" + escapeRegistryRepositoryPath(repository) + "/tags/list?" + query.Encode()
}

func registryManifestPath(repository, reference string) string {
	return "/v2/" + escapeRegistryRepositoryPath(repository) + "/manifests/" + url.PathEscape(reference)
}

func escapeRegistryRepositoryPath(repository string) string {
	segments := strings.Split(repository, "/")
	for index, segment := range segments {
		segments[index] = url.PathEscape(segment)
	}
	return strings.Join(segments, "/")
}
