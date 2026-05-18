package server

import (
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/careywong/registry-webui/internal/config"
)

type Routes struct {
	StaticFiles fs.FS
	Auth        AuthConfig
	Config      config.Config
	Registry    registryClient
}

type Server struct {
	config   config.Config
	registry registryClient
}

func New(routes Routes) http.Handler {
	staticFiles := routes.StaticFiles
	if staticFiles == nil {
		staticFiles = osDirFS("web/dist")
	}

	mux := http.NewServeMux()
	server := &Server{
		config:   routes.Config,
		registry: routes.Registry,
	}

	mux.HandleFunc("/api/session", routes.Auth.sessionHandler)
	mux.HandleFunc("/api/status", requireAuthentication(routes.Auth, server.statusHandler))
	mux.HandleFunc("/api/repositories", requireAuthentication(routes.Auth, server.repositoriesHandler))
	mux.HandleFunc("/api/repositories/", requireAuthentication(routes.Auth, server.repositorySubresourceHandler))
	mux.HandleFunc("/api/", requireAuthentication(routes.Auth, apiNotFound))
	mux.HandleFunc("/", frontendHandler(staticFiles))
	return mux
}

func apiNotFound(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotFound, "not_found", "API route is not implemented")
}

func requireAuthentication(auth AuthConfig, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !auth.validSession(r) {
			writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
			return
		}
		next(w, r)
	}
}

func frontendHandler(staticFiles fs.FS) http.HandlerFunc {
	fileServer := http.FileServer(http.FS(staticFiles))

	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		requestPath := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if requestPath == "." || requestPath == "" {
			serveIndex(w, r, staticFiles)
			return
		}

		if isStaticAsset(staticFiles, requestPath) {
			fileServer.ServeHTTP(w, r)
			return
		}

		serveIndex(w, r, staticFiles)
	}
}

func isStaticAsset(staticFiles fs.FS, requestPath string) bool {
	info, err := fs.Stat(staticFiles, requestPath)
	return err == nil && !info.IsDir()
}

func serveIndex(w http.ResponseWriter, r *http.Request, staticFiles fs.FS) {
	index, err := fs.ReadFile(staticFiles, "index.html")
	if err != nil {
		http.Error(w, "frontend index.html not found", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(index)
}
