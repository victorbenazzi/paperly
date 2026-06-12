# CLAUDE.md

## Projeto

- **Paperly**: app de notas Markdown local-first (Tauri 2 + React 19 + BlockNote). A pasta local chama `noteflow`, mas o produto e o repo são Paperly: `victorbenazzi/paperly` (GitHub, público).
- Gerenciador: pnpm. `pnpm tauri dev` roda o app; `pnpm dev` sozinho roda só a UI no navegador usando o mock de IPC (`src/lib/ipc.mock.ts`).
- i18n en + pt-BR em `src/features/i18n/locales/`; toda string nova entra nos dois arquivos.

## Releases e auto-update

- Workflow `.github/workflows/release.yml`: tag `v*` (ou workflow_dispatch) builda macOS arm64/Intel, Windows e Linux (deb/rpm, sem AppImage) via `tauri-apps/tauri-action` e cria a release como **draft** com `latest.json` assinado (`includeUpdaterJson: true`).
- A publicação é manual de propósito: revisar o draft no GitHub e clicar Publish. Só release publicada chega nos apps (endpoint `releases/latest/download/latest.json`).
- Fluxo de release: bump da versão em `package.json`, `src-tauri/Cargo.toml` e `src-tauri/tauri.conf.json` (os 3 sempre iguais), commit, `git tag vX.Y.Z`, push da tag, publicar o draft.
- Updater no app: `tauri-plugin-updater`; endpoint e pubkey em `src-tauri/tauri.conf.json` (`plugins.updater`); capability `updater:default`; `bundle.createUpdaterArtifacts: true`.
- Frontend: `src/features/updates/` (store zustand + service com `checkSilent`/`startInstall`) e `src/components/updates/UpdatePill.tsx` (pílula azul no MainHeader). Check silencioso 3s após o boot no `AppShell`; em dev nada roda (guard `import.meta.env.DEV`).
- Secrets do repo (já configurados): `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)` e `APPLE_CERTIFICATE(_PASSWORD)`. O material privado vive SÓ em `~/.paperly-signing/`. Nunca commitar, imprimir em log ou regenerar sem motivo.
- Cert macOS autoassinado estável (`paperly self-signed`, gerado por `scripts/gen-signing-cert.sh`): mantém as permissões TCC entre updates. **Não regenerar** (reseta as permissões de todo usuário). Não notariza: primeira instalação pede `sudo xattr -cr /Applications/Paperly.app`.
- Linux deb/rpm não recebem auto-update (limitação do Tauri); atualiza via gerenciador de pacotes.
- Histórico: v0.1.0 publicado em 12/06/2026 (primeiro release). O teste e2e da pílula só é possível com 2 releases: instalar um, publicar o próximo, a pílula aparece no boot.
- Se o build das actions quebrar por versão de Node (aviso de deprecação do Node 20, junho/2026), o fix é bump de `actions/checkout`, `actions/setup-node` e `pnpm/action-setup`.
