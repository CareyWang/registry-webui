package main

import (
	"log"
	"net/http"
	"os"

	"github.com/careywong/registry-webui/internal/config"
	"github.com/careywong/registry-webui/internal/registry"
	"github.com/careywong/registry-webui/internal/server"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("configuration error: %v", err)
	}

	staticDir := os.Getenv("WEB_DIST_DIR")
	if staticDir == "" {
		staticDir = "web/dist"
	}

	registryClient, err := registry.NewFromConfig(cfg)
	if err != nil {
		log.Fatalf("registry client error: %v", err)
	}

	log.Printf("starting registry webui on %s", cfg.Address())
	log.Fatal(http.ListenAndServe(cfg.Address(), server.New(server.Routes{
		StaticFiles: os.DirFS(staticDir),
		Auth: server.AuthConfig{
			Username: cfg.AdminUsername,
			Password: cfg.AdminPassword,
		},
		Config:   cfg,
		Registry: registryClient,
	})))
}
