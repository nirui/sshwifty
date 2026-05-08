# AGENTS.md

## Project Overview

Sshwifty is a web-based SSH and Telnet client. The repository combines:

- A Go backend in `sshwifty.go` and `application/`.
- A Vue 2 frontend in `ui/`.
- A Webpack build pipeline in `webpack.config.js`.
- Docker packaging in `Dockerfile` and `docker-compose.example.yaml`.
- GitHub Actions automation under `.github/`.

The module path is `github.com/Snuffy2/sshwifty`. The project is licensed under
AGPL-3.0-only; preserve existing license headers when editing source files.

## Source Layout

- `application/configuration/`: config file and environment loading.
- `application/controller/`: HTTP routes, static page serving, socket handling.
- `application/command/` and `application/commands/`: command protocol and
  typed command values shared with connection flows.
- `application/network/`: TCP/SOCKS dialing and connection wrappers.
- `application/server/`: HTTP server setup.
- `application/log/`: project logging helpers.
- `ui/`: Vue components, browser command protocol, stream handling, styles,
  static files, and frontend tests.
- `application/controller/static_page_generater/`: generator used by
  `go generate` during frontend/static asset generation.
- `.tmp/`: generated build output. Treat it as disposable unless a task is
  explicitly about generated output.

## Development Commands

Install Node dependencies with:

```sh
npm ci
```

Use the scripts in `package.json` as the source of truth:

```sh
npm run generate
npm run build
npm run lint
npm run lint:fix
npm run testonly
npm test
```

Important behavior:

- `npm run generate` cleans `.tmp/`, builds frontend assets with Webpack, and
  runs Go static page generation.
- `npm run build` runs generation and then builds the `sshwifty` binary.
- `npm run testonly` runs Mocha frontend tests and `go test ./... -race`.
- `npm test` runs generation first, then `testonly`.
- `npm run dev` starts Webpack watch mode and runs `go run sshwifty.go` with
  `SSHWIFTY_CONFIG=sshwifty.conf.example.json` and `SSHWIFTY_DEBUG=_`.

For Go-only checks, use:

```sh
go test ./...
go test ./... -race -timeout 30s
go vet ./...
go mod tidy
```

For hook parity with CI, use the repo-local `prek.toml`:

```sh
prek run --all-files
```

## Validation Expectations

Run the narrowest validation that proves the change, then broaden based on
risk:

- Go backend change: run targeted `go test` for the touched package, then
  consider `go test ./... -race -timeout 30s`.
- Frontend logic change: run the relevant Mocha tests or `npm run testonly`.
- Build pipeline, generated assets, or static serving change: run
  `npm run generate` and, when practical, `npm run build`.
- Lint/style-only change: run `npm run lint` or
  `prek run --all-files`.
- GitHub Actions change: run `prek run --all-files` so `actionlint`
  runs through the configured hook.

CI runs `npm ci`, `npm run generate`, and `prek` on pushes to `main`, pull
requests, and manual dispatch.

## Coding Conventions

- Keep imports at the top of files and preserve existing comments.
- Prefer small, root-cause fixes over broad rewrites.
- Match existing Go package structure and frontend component patterns.
- Add or update tests for changed behavior.
- Keep Go code formatted with `gofmt`.
- Keep frontend code compatible with Vue 2.7 and the current Webpack/Babel
  setup.
- Use existing command, stream, and connector abstractions instead of
  duplicating protocol logic.
- Treat hook commands and connection inputs as untrusted; avoid command-line
  injection and keep error handling explicit.
- Do not commit generated `.tmp/` output unless the user explicitly asks.

## Frontend Notes

The UI uses Vue single-file components and plain CSS under `ui/`. Tests live
beside frontend modules as `*_test.js` and run under Mocha with Babel
registration.

### When changing UI behavior

- Keep terminal behavior, stream handling, and keyboard handling stable.
- Check mobile and desktop layout assumptions for visible UI changes.
- Prefer existing widgets under `ui/widgets/` over new one-off controls.
- Preserve accessible, inspectable text and avoid unnecessary visual churn.

## Backend Notes

The backend serves the web application and proxies SSH/Telnet sessions over the
project command protocol.

### When changing backend behavior

- Keep configuration compatibility with both file and environment loaders.
- Preserve timeout semantics for dialing, hooks, HTTP reads, and writes.
- Keep hook execution bounded by configured deadlines and sanitize any new
  external-process inputs.
- Avoid logging secrets such as shared keys, SOCKS credentials, TLS key
  material, or preset credentials.

## Docker And Release Notes

`Dockerfile` is the canonical reference for container builds. It builds the
application in Debian-based stages, then copies the final binary into an Alpine
runtime image.

GitHub release publishing is configured in `.github/workflows/release.yml` for
GHCR image `ghcr.io/snuffy2/sshwifty`.

Do not push branches, publish images, or open pull requests unless the user
explicitly asks.

## Git And File Safety

- Do not revert user changes unless explicitly instructed.
- Before editing a file that already has uncommitted changes, inspect it and
  work with the current contents.
- Keep changes scoped to the requested task.
