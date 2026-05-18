package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultAppPort                = "3000"
	defaultAdminUsername          = "admin"
	defaultAdminPassword          = "change-me"
	defaultRegistryPageSize       = 100
	defaultRegistryRequestTimeout = 30 * time.Second
)

type Config struct {
	AppPort                string
	AdminUsername          string
	AdminPassword          string
	RegistryURL            string
	RegistryUsername       string
	RegistryPassword       string
	RegistryInsecureTLS    bool
	RegistryPageSize       int
	RegistryRequestTimeout time.Duration
}

func Load() (Config, error) {
	cfg := Config{
		AppPort:                envOrDefault("APP_PORT", defaultAppPort),
		AdminUsername:          envOrDefault("ADMIN_USERNAME", defaultAdminUsername),
		AdminPassword:          envOrDefault("ADMIN_PASSWORD", defaultAdminPassword),
		RegistryURL:            strings.TrimSpace(os.Getenv("REGISTRY_URL")),
		RegistryUsername:       os.Getenv("REGISTRY_USERNAME"),
		RegistryPassword:       os.Getenv("REGISTRY_PASSWORD"),
		RegistryPageSize:       defaultRegistryPageSize,
		RegistryRequestTimeout: defaultRegistryRequestTimeout,
	}

	if cfg.RegistryURL == "" {
		return Config{}, errors.New("REGISTRY_URL is required")
	}

	if isProduction() && cfg.AdminPassword == defaultAdminPassword {
		return Config{}, errors.New("ADMIN_PASSWORD must not be change-me in production")
	}

	insecureTLS, err := parseBoolEnv("REGISTRY_INSECURE_TLS")
	if err != nil {
		return Config{}, err
	}
	cfg.RegistryInsecureTLS = insecureTLS

	pageSize, err := parsePageSize(os.Getenv("REGISTRY_PAGE_SIZE"))
	if err != nil {
		return Config{}, err
	}
	cfg.RegistryPageSize = pageSize

	timeout, err := parseTimeout(os.Getenv("REGISTRY_REQUEST_TIMEOUT"))
	if err != nil {
		return Config{}, err
	}
	cfg.RegistryRequestTimeout = timeout

	return cfg, nil
}

func (c Config) Address() string {
	return ":" + c.AppPort
}

func envOrDefault(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func isProduction() bool {
	for _, key := range []string{"APP_ENV", "GO_ENV", "ENV"} {
		if strings.EqualFold(strings.TrimSpace(os.Getenv(key)), "production") {
			return true
		}
	}
	return false
}

func parseBoolEnv(key string) (bool, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return false, nil
	}

	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("%s must be a boolean: %w", key, err)
	}
	return parsed, nil
}

func parsePageSize(value string) (int, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return defaultRegistryPageSize, nil
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("REGISTRY_PAGE_SIZE must be an integer between 10 and 1000: %w", err)
	}
	if parsed < 10 || parsed > 1000 {
		return 0, fmt.Errorf("REGISTRY_PAGE_SIZE must be between 10 and 1000, got %d", parsed)
	}
	return parsed, nil
}

func parseTimeout(value string) (time.Duration, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return defaultRegistryRequestTimeout, nil
	}

	timeout, err := time.ParseDuration(value)
	if err == nil {
		return timeout, nil
	}

	seconds, secondsErr := strconv.Atoi(value)
	if secondsErr != nil {
		return 0, fmt.Errorf("REGISTRY_REQUEST_TIMEOUT must be a Go duration or seconds value: %w", err)
	}
	if seconds <= 0 {
		return 0, fmt.Errorf("REGISTRY_REQUEST_TIMEOUT must be positive, got %d", seconds)
	}
	return time.Duration(seconds) * time.Second, nil
}
