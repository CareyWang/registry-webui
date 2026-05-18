package config

import (
	"strings"
	"testing"
	"time"
)

func TestLoadReadsEnvironmentWithDefaults(t *testing.T) {
	t.Setenv("REGISTRY_URL", "https://registry.example.com")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.AppPort != "3000" {
		t.Fatalf("AppPort = %q, want 3000", cfg.AppPort)
	}
	if cfg.AdminUsername != "admin" {
		t.Fatalf("AdminUsername = %q, want admin", cfg.AdminUsername)
	}
	if cfg.AdminPassword != "change-me" {
		t.Fatalf("AdminPassword = %q, want change-me", cfg.AdminPassword)
	}
	if cfg.RegistryURL != "https://registry.example.com" {
		t.Fatalf("RegistryURL = %q", cfg.RegistryURL)
	}
	if cfg.RegistryPageSize != 100 {
		t.Fatalf("RegistryPageSize = %d, want 100", cfg.RegistryPageSize)
	}
	if cfg.RegistryRequestTimeout != 30*time.Second {
		t.Fatalf("RegistryRequestTimeout = %s, want 30s", cfg.RegistryRequestTimeout)
	}
}

func TestLoadReadsAllSupportedEnvironmentVariables(t *testing.T) {
	t.Setenv("APP_PORT", "8080")
	t.Setenv("ADMIN_USERNAME", "root")
	t.Setenv("ADMIN_PASSWORD", "secret")
	t.Setenv("REGISTRY_URL", "https://registry.internal")
	t.Setenv("REGISTRY_USERNAME", "registry-user")
	t.Setenv("REGISTRY_PASSWORD", "registry-secret")
	t.Setenv("REGISTRY_INSECURE_TLS", "true")
	t.Setenv("REGISTRY_PAGE_SIZE", "250")
	t.Setenv("REGISTRY_REQUEST_TIMEOUT", "45s")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.AppPort != "8080" ||
		cfg.AdminUsername != "root" ||
		cfg.AdminPassword != "secret" ||
		cfg.RegistryURL != "https://registry.internal" ||
		cfg.RegistryUsername != "registry-user" ||
		cfg.RegistryPassword != "registry-secret" ||
		!cfg.RegistryInsecureTLS ||
		cfg.RegistryPageSize != 250 ||
		cfg.RegistryRequestTimeout != 45*time.Second {
		t.Fatalf("Load() = %+v", cfg)
	}
}

func TestLoadRequiresRegistryURL(t *testing.T) {
	_, err := Load()
	if err == nil {
		t.Fatal("Load() error = nil, want missing REGISTRY_URL error")
	}
	if !strings.Contains(err.Error(), "REGISTRY_URL is required") {
		t.Fatalf("Load() error = %q", err)
	}
}

func TestLoadRejectsDefaultAdminPasswordInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("REGISTRY_URL", "https://registry.example.com")
	t.Setenv("ADMIN_PASSWORD", "change-me")

	_, err := Load()
	if err == nil {
		t.Fatal("Load() error = nil, want production ADMIN_PASSWORD error")
	}
	if !strings.Contains(err.Error(), "ADMIN_PASSWORD must not be change-me in production") {
		t.Fatalf("Load() error = %q", err)
	}
}

func TestLoadRejectsPageSizeOutsideAllowedRange(t *testing.T) {
	for _, value := range []string{"9", "1001", "invalid"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("REGISTRY_URL", "https://registry.example.com")
			t.Setenv("REGISTRY_PAGE_SIZE", value)

			_, err := Load()
			if err == nil {
				t.Fatalf("Load() error = nil, want REGISTRY_PAGE_SIZE error for %q", value)
			}
			if !strings.Contains(err.Error(), "REGISTRY_PAGE_SIZE") {
				t.Fatalf("Load() error = %q", err)
			}
		})
	}
}
